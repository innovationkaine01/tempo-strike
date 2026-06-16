/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Grid, PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { GameStatus, NoteData, HandPositions, COLORS, CutDirection } from '../types';
import { PLAYER_Z, SPAWN_Z, MISS_Z, NOTE_SPEED, DIRECTION_VECTORS, NOTE_SIZE, LANE_X_POSITIONS, LAYER_Y_POSITIONS, SONG_BPM } from '../constants';
import Note from './Note';
import Saber from './Saber';

interface GameSceneProps {
  gameStatus: GameStatus;
  audioRef: React.RefObject<HTMLAudioElement>;
  handPositionsRef: React.MutableRefObject<any>; // Simplified type for the raw ref
  chart: NoteData[];
  onNoteHit: (note: NoteData, goodCut: boolean) => void;
  onNoteMiss: (note: NoteData) => void;
  onSongEnd: () => void;
  theme?: 'light' | 'dark';
  playMode?: 'webcam' | 'touch';
  speedMultiplier?: number;
}

const BEAT_TIME = 60 / SONG_BPM;

const GameScene: React.FC<GameSceneProps> = ({ 
    gameStatus, 
    audioRef, 
    handPositionsRef, 
    chart,
    onNoteHit,
    onNoteMiss,
    onSongEnd,
    theme = 'dark',
    playMode = 'webcam',
    speedMultiplier = 1.0
}) => {
  // Local state for notes to trigger re-renders when they are hit/missed
  const [notesState] = useState<NoteData[]>(chart);
  const [currentTime, setCurrentTime] = useState(0);

  // Refs for things we don't want causing re-renders every frame
  const activeNotesRef = useRef<NoteData[]>([]);
  const nextNoteIndexRef = useRef(0);
  const shakeIntensity = useRef(0);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);

  // Helper Vector3s for collision to avoid GC
  const vecA = useMemo(() => new THREE.Vector3(), []);
  const vecB = useMemo(() => new THREE.Vector3(), []);

  // Set note speed and BPM scale
  const currentNoteSpeed = NOTE_SPEED * speedMultiplier;

  // Wrap onNoteHit to add Scene-level effects (Camera shake)
  const handleHit = (note: NoteData, goodCut: boolean) => {
      shakeIntensity.current = goodCut ? 0.35 : 0.2;
      onNoteHit(note, goodCut);
  }

  useFrame((state, delta) => {
    // --- Beat Pulsing ---
    if (audioRef.current && gameStatus === GameStatus.PLAYING) {
        const time = audioRef.current.currentTime;
        const currentBpm = SONG_BPM * speedMultiplier;
        const localBeatTime = 60 / currentBpm;
        const beatPhase = (time % localBeatTime) / localBeatTime;
        const pulse = Math.pow(1 - beatPhase, 4); 
        
        if (ambientLightRef.current) {
            ambientLightRef.current.intensity = theme === 'light' 
                ? 0.5 + (pulse * 0.15) 
                : 0.1 + (pulse * 0.3);
        }
        if (spotLightRef.current) {
            spotLightRef.current.intensity = theme === 'light' 
                ? 1.0 + (pulse * 0.5) 
                : 0.5 + (pulse * 1.5);
        }
    }

    // --- Camera Shake ---
    if (shakeIntensity.current > 0 && cameraRef.current) {
        const shake = shakeIntensity.current;
        cameraRef.current.position.x = (Math.random() - 0.5) * shake;
        cameraRef.current.position.y = 1.8 + (Math.random() - 0.5) * shake;
        cameraRef.current.position.z = 4 + (Math.random() - 0.5) * shake;
        
        // Decay shake
        shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, 10 * delta);
        if (shakeIntensity.current < 0.01) {
             shakeIntensity.current = 0;
             cameraRef.current.position.set(0, 1.8, 4);
        }
    }

    if (gameStatus !== GameStatus.PLAYING || !audioRef.current) return;

    // Sync time with audio
    const time = audioRef.current.currentTime;
    setCurrentTime(time);

    if (audioRef.current.ended) {
        onSongEnd();
        return;
    }

    // 1. Spawn Notes
    // Look ahead by the time it takes for a note to travel from spawn to player
    const spawnAheadTime = Math.abs(SPAWN_Z - PLAYER_Z) / currentNoteSpeed;
    
    while (nextNoteIndexRef.current < notesState.length) {
      const nextNote = notesState[nextNoteIndexRef.current];
      if (nextNote.time - spawnAheadTime <= time) {
        activeNotesRef.current.push(nextNote);
        nextNoteIndexRef.current++;
      } else {
        break;
      }
    }

    // 2. Update & Collide Notes
    const hands = handPositionsRef.current as HandPositions;

    for (let i = activeNotesRef.current.length - 1; i >= 0; i--) {
        const note = activeNotesRef.current[i];
        if (note.hit || note.missed) continue;

        // Calculate current Z position
        const timeDiff = note.time - time; 
        const currentZ = PLAYER_Z - (timeDiff * currentNoteSpeed);

        // Miss check (passed player)
        if (currentZ > MISS_Z) {
            note.missed = true;
            onNoteMiss(note);
            activeNotesRef.current.splice(i, 1);
            continue;
        }

        // Collision check (only if near player)
        // Highly generous window for elderly players
        const hitWindowBack = -1.6;
        const hitWindowFront = 1.2;
        if (currentZ > PLAYER_Z + hitWindowBack && currentZ < PLAYER_Z + hitWindowFront) {
            const handPos = note.type === 'left' ? hands.left : hands.right;
            const handVel = note.type === 'left' ? hands.leftVelocity : hands.rightVelocity;

            if (handPos) {
                 const notePos = vecA.set(
                     LANE_X_POSITIONS[note.lineIndex],
                     LAYER_Y_POSITIONS[note.lineLayer],
                     currentZ
                 );

                 let isHit = false;
                 let goodCut = true;

                 if (playMode === 'touch') {
                     // Touch Mode: Tapping matches X-coordinate (width) of the lane and respects hitting Z window.
                     // It bypasses vertical heights (Y) and angle directions entirely for high accessibility!
                     const isLaneMatch = Math.abs(handPos.x - notePos.x) < 0.1;
                     if (isLaneMatch) {
                         isHit = true;
                         goodCut = true;
                     }
                 } else {
                     // Webcam mode: uses distance-based collision
                     // Make collision radius even larger when playing at slower speed to help elderly players
                     const collisionRadius = speedMultiplier < 0.8 ? 1.2 : 0.85;
                     if (handPos.distanceTo(notePos) < collisionRadius) {
                         isHit = true;
                         const speed = handVel.length();

                         // Extremely forgiving direction swings
                         if (note.cutDirection !== CutDirection.ANY) {
                             const requiredDir = DIRECTION_VECTORS[note.cutDirection];
                             vecB.copy(handVel).normalize();
                             const dot = vecB.dot(requiredDir);
                             
                             if (dot < 0.1 || speed < 1.0) { 
                                 goodCut = false;
                             }
                         } else {
                             if (speed < 1.0) goodCut = false; 
                         }
                     }
                 }

                 if (isHit) {
                     note.hit = true;
                     note.hitTime = time;
                     handleHit(note, goodCut);
                     activeNotesRef.current.splice(i, 1);
                 }
            }
        }
    }
  });

  // Map active notes to components. 
  const visibleNotes = useMemo(() => {
     return notesState.filter(n => 
         !n.missed && 
         (!n.hit || (currentTime - (n.hitTime || 0) < 0.5)) && // Keep hit notes for 0.5s
         (n.time - currentTime) < 5 && 
         (n.time - currentTime) > -2 
     );
  }, [notesState, currentTime]);

  // Refs for visual sabers
  const leftHandPosRef = useRef<THREE.Vector3 | null>(null);
  const rightHandPosRef = useRef<THREE.Vector3 | null>(null);
  const leftHandVelRef = useRef<THREE.Vector3 | null>(null);
  const rightHandVelRef = useRef<THREE.Vector3 | null>(null);

  useFrame(() => {
     leftHandPosRef.current = handPositionsRef.current.left;
     rightHandPosRef.current = handPositionsRef.current.right;
     leftHandVelRef.current = handPositionsRef.current.leftVelocity;
     rightHandVelRef.current = handPositionsRef.current.rightVelocity;
  });

  const isLight = theme === 'light';
  const bgColor = isLight ? '#f8fafc' : '#050505';

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.8, 4]} fov={60} />
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={[bgColor, 8, 45]} />
      
      {/* Pulsing Lights */}
      <ambientLight ref={ambientLightRef} intensity={isLight ? 0.6 : 0.22} />
      <spotLight ref={spotLightRef} position={[0, 10, 5]} angle={0.5} penumbra={1} intensity={isLight ? 1.5 : 1.1} castShadow />
      
      <Environment preset={isLight ? "sunset" : "night"} />

      {/* Floor / Track visuals */}
      <Grid 
        position={[0, 0, 0]} 
        args={[6, 100]} 
        cellThickness={0.1} 
        cellColor={isLight ? '#cbd5e1' : '#222'} 
        sectionSize={5} 
        sectionThickness={1.5} 
        sectionColor={isLight ? '#64748b' : COLORS.right} 
        fadeDistance={45} 
        infiniteGrid 
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <planeGeometry args={[4, 100]} />
          <meshStandardMaterial 
              color={isLight ? '#f1f5f9' : '#111'} 
              roughness={isLight ? 0.95 : 0.8} 
              metalness={isLight ? 0.05 : 0.5} 
          />
      </mesh>
      
      {!isLight && <Stars radius={50} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />}

      <Saber type="left" positionRef={leftHandPosRef} velocityRef={leftHandVelRef} />
      <Saber type="right" positionRef={rightHandPosRef} velocityRef={rightHandVelRef} />

      {visibleNotes.map(note => (
          <Note 
            key={note.id} 
            data={note} 
            zPos={PLAYER_Z - ((note.time - currentTime) * currentNoteSpeed)} 
            currentTime={currentTime}
            theme={theme}
          />
      ))}
    </>
  );
};

export default GameScene;
