/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { GameStatus, NoteData } from './types';
import { DEMO_CHART, SONG_URL, SONG_BPM, LANE_X_POSITIONS } from './constants';
import { useMediaPipe } from './hooks/useMediaPipe';
import GameScene from './components/GameScene';
import WebcamPreview from './components/WebcamPreview';
import { 
  Play, 
  RefreshCw, 
  VideoOff, 
  Hand, 
  Sparkles, 
  Sun, 
  Moon, 
  Users, 
  Tv, 
  CheckCircle, 
  XOctagon 
} from 'lucide-react';

const App: React.FC = () => {
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.LOADING);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [health, setHealth] = useState(100);

  // Settings for Elderly Players
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [playMode, setPlayMode] = useState<'webcam' | 'touch'>('touch'); // Default to touch for App Inventor compatibility
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(0.65); // Default to Slow for elder rehabilitation

  const audioRef = useRef<HTMLAudioElement>(new Audio(SONG_URL));
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const { isCameraReady, handPositionsRef, lastResultsRef, error: cameraError } = useMediaPipe(videoRef, playMode === 'webcam');

  // Trigger simulated saber strikes in touch/keyboard mode
  const triggerSaberStrike = useCallback((type: 'left' | 'right', laneIndex: number) => {
    if (!handPositionsRef || !handPositionsRef.current) return;
    
    // Position simulated saber exactly at the core lane coordinates
    const laneX = LANE_X_POSITIONS[laneIndex];
    const targetPos = new THREE.Vector3(laneX, 1.2, 0); // Active collision spot

    // Trigger slight vibration for tactile feedback
    if (navigator.vibrate) {
        navigator.vibrate(20);
    }

    if (type === 'left') {
        handPositionsRef.current.left = targetPos;
        handPositionsRef.current.leftVelocity.set(0, 15, 0); // Fast upward speed swing
        
        setTimeout(() => {
            if (handPositionsRef.current) {
                handPositionsRef.current.left = null;
                handPositionsRef.current.leftVelocity.set(0, 0, 0);
            }
        }, 130);
    } else {
        handPositionsRef.current.right = targetPos;
        handPositionsRef.current.rightVelocity.set(0, 15, 0); // Fast upward speed swing
        
        setTimeout(() => {
            if (handPositionsRef.current) {
                handPositionsRef.current.right = null;
                handPositionsRef.current.rightVelocity.set(0, 0, 0);
            }
        }, 130);
    }
  }, [handPositionsRef]);

  // Keyboard controls for Testing & Desktop App Inventor WebViewer
  useEffect(() => {
    if (gameStatus !== GameStatus.PLAYING) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // P1: S / D
      if (key === 's') {
        triggerSaberStrike('left', 0);
      } else if (key === 'd') {
        triggerSaberStrike('left', 1);
      }
      // P2: K / L
      else if (key === 'k') {
        triggerSaberStrike('right', 2);
      } else if (key === 'l') {
        triggerSaberStrike('right', 3);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameStatus, triggerSaberStrike]);

  // Game Logic Handlers
  const handleNoteHit = useCallback((note: NoteData, goodCut: boolean) => {
     let points = 100;
     if (goodCut) points += 50; 

     if (navigator.vibrate) {
         navigator.vibrate(goodCut ? 40 : 20);
     }

     setCombo(c => {
       const newCombo = c + 1;
       if (newCombo > 30) setMultiplier(8);
       else if (newCombo > 20) setMultiplier(4);
       else if (newCombo > 10) setMultiplier(2);
       else setMultiplier(1);
       return newCombo;
     });

     setScore(s => s + (points * multiplier));
     setHealth(h => Math.min(100, h + 3)); // Slightly more health recovery for elderly
  }, [multiplier]);

  const handleNoteMiss = useCallback((note: NoteData) => {
      setCombo(0);
      setMultiplier(1);
      setHealth(h => {
          // Less strict health penalty for senior mode (10 instead of 15)
          const newHealth = h - 10;
          if (newHealth <= 0) {
             setTimeout(() => endGame(false), 0);
             return 0;
          }
          return newHealth;
      });
  }, []);

  const startGame = async () => {
    // If we require camera but it's not ready, block it. 
    // If in Touch mode, camera is not needed at all!
    if (playMode === 'webcam' && !isCameraReady) return;
    
    setScore(0);
    setCombo(0);
    setMultiplier(1);
    setHealth(100);

    DEMO_CHART.forEach(n => { n.hit = false; n.missed = false; });

    try {
      if (audioRef.current) {
          audioRef.current.currentTime = 0;
          // Dynamically adjust audio pace using HTML5 audio playbackRate
          audioRef.current.playbackRate = speedMultiplier;
          await audioRef.current.play();
          setGameStatus(GameStatus.PLAYING);
      }
    } catch (e) {
        console.error("Audio play failed", e);
        alert("音訊播放失敗。請先點選畫面任意處與網頁互動，再開啟遊戲！");
    }
  };

  const endGame = (victory: boolean) => {
      setGameStatus(victory ? GameStatus.VICTORY : GameStatus.GAME_OVER);
      if (audioRef.current) {
          audioRef.current.pause();
      }
  };

  useEffect(() => {
      // Auto transition from loading once system resolves
      if (gameStatus === GameStatus.LOADING) {
          setGameStatus(GameStatus.IDLE);
      }
  }, [gameStatus]);

  // Handle dynamic audio speed changes if modified in menu
  useEffect(() => {
    if (audioRef.current && gameStatus === GameStatus.PLAYING) {
        audioRef.current.playbackRate = speedMultiplier;
    }
  }, [speedMultiplier, gameStatus]);

  const isLight = theme === 'light';

  return (
    <div className={`relative w-full h-screen overflow-hidden font-sans transition-colors duration-500 ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-white'}`}>
      {/* Hidden Video for Image Processing */}
      <video 
        ref={videoRef} 
        className="absolute opacity-0 pointer-events-none"
        playsInline
        muted
        autoPlay
        style={{ width: '640px', height: '480px' }}
      />

      {/* 3D Canvas */}
      <Canvas shadows dpr={[1, 2]}>
          {gameStatus !== GameStatus.LOADING && (
             <GameScene 
                gameStatus={gameStatus}
                audioRef={audioRef}
                handPositionsRef={handPositionsRef}
                chart={DEMO_CHART}
                onNoteHit={handleNoteHit}
                onNoteMiss={handleNoteMiss}
                onSongEnd={() => endGame(true)}
                theme={theme}
                playMode={playMode}
                speedMultiplier={speedMultiplier}
             />
          )}
      </Canvas>

      {/* Camera Live Preview Overlay (Only visible in Webcam mode if camera is working) */}
      {playMode === 'webcam' && (
        <WebcamPreview 
            videoRef={videoRef} 
            resultsRef={lastResultsRef} 
            isCameraReady={isCameraReady} 
        />
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-10">
          
          {/* HUD Status Bar (Top) */}
          <div className="flex justify-between items-start w-full">
             {/* Health Bar / Integrity */}
             <div className="w-1/3 max-w-xs pointer-events-auto">
                 <div className="h-6 bg-slate-800/40 rounded-full overflow-hidden border-2 border-slate-400 shadow-md">
                     <div 
                        className={`h-full transition-all duration-300 ease-out ${
                          health > 50 ? 'bg-green-500' : health > 20 ? 'bg-amber-500' : 'bg-red-600'
                        }`}
                        style={{ width: `${health}%` }}
                     />
                 </div>
                 <p className={`text-sm mt-1 font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                   💓 合力防護力：{health}%
                 </p>
             </div>

             {/* Score & Combo */}
             <div className="text-center bg-black/30 backdrop-blur-sm px-6 py-2 rounded-2xl border border-white/10">
                 <h1 className={`text-4xl md:text-5xl font-black tracking-wider ${
                   isLight ? 'text-blue-700 drop-shadow-md' : 'text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]'
                 }`}>
                     {score.toLocaleString()} 分
                 </h1>
                 <div className="mt-1 flex flex-col items-center">
                     <p className={`text-xl font-bold ${combo > 10 ? 'text-indigo-400 scale-110' : 'text-slate-300'} transition-all`}>
                         🔥 {combo} 連擊 (COMBO)
                     </p>
                     {multiplier > 1 && (
                         <span className="text-xs font-extrabold px-3 py-1 bg-red-600 text-white rounded-full mt-1 animate-pulse">
                             🌟 得分加倍 {multiplier}x!
                         </span>
                     )}
                 </div>
             </div>
             
             {/* Mode Controllers (Persistent in Top Right) */}
             <div className="w-1/3 flex justify-end gap-2 pointer-events-auto">
                <button 
                  onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                  className={`p-3 rounded-full shadow-lg ${isLight ? 'bg-white hover:bg-slate-200 text-slate-800' : 'bg-slate-900 hover:bg-slate-800 text-amber-400'} border transition-all transform hover:scale-110`}
                  title={isLight ? "切換至暗黑模式" : "切換至明亮模式"}
                >
                  {isLight ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                </button>
             </div>
          </div>

          {/* Touch Area Overlay (Visible only when playing in touch mode) */}
          {gameStatus === GameStatus.PLAYING && playMode === 'touch' && (
            <div className="w-full max-w-4xl mx-auto pointer-events-auto select-none mt-auto mb-4">
              <div className="flex w-full gap-4 p-3 bg-slate-950/80 rounded-2xl border border-white/20 shadow-2xl">
                
                {/* Player 1 Left Side Touch Controls */}
                <div className="flex-1 grid grid-cols-2 gap-3 p-3 bg-red-500/10 border-2 border-red-500/30 rounded-xl">
                  <div className="col-span-2 text-center text-red-500 font-extrabold text-base tracking-wider pb-1">
                    🔴 P1 隊員控制 (左方雙軌道)
                  </div>
                  <button 
                    onMouseDown={() => triggerSaberStrike('left', 0)}
                    onTouchStart={(e) => { e.preventDefault(); triggerSaberStrike('left', 0); }}
                    className="h-28 bg-red-600 hover:bg-red-500 text-white font-black text-2xl rounded-xl transition-all active:scale-95 flex flex-col justify-center items-center shadow-lg border-2 border-red-400 select-none cursor-pointer"
                  >
                    <span>左外側</span>
                    <span className="text-xs mt-2 bg-red-800 px-2 py-0.5 rounded opacity-80 font-mono font-normal">[S 鍵]</span>
                  </button>
                  <button 
                    onMouseDown={() => triggerSaberStrike('left', 1)}
                    onTouchStart={(e) => { e.preventDefault(); triggerSaberStrike('left', 1); }}
                    className="h-28 bg-red-700 hover:bg-red-600 text-white font-black text-2xl rounded-xl transition-all active:scale-95 flex flex-col justify-center items-center shadow-lg border-2 border-red-500 select-none cursor-pointer"
                  >
                    <span>左內側</span>
                    <span className="text-xs mt-2 bg-red-900 px-2 py-0.5 rounded opacity-80 font-mono font-normal">[D 鍵]</span>
                  </button>
                </div>
                
                {/* Player 2 Right Side Touch Controls */}
                <div className="flex-1 grid grid-cols-2 gap-3 p-3 bg-blue-500/10 border-2 border-blue-500/30 rounded-xl">
                  <div className="col-span-2 text-center text-blue-400 font-extrabold text-base tracking-wider pb-1">
                    🔵 P2 隊員控制 (右方雙軌道)
                  </div>
                  <button 
                    onMouseDown={() => triggerSaberStrike('right', 2)}
                    onTouchStart={(e) => { e.preventDefault(); triggerSaberStrike('right', 2); }}
                    className="h-28 bg-blue-700 hover:bg-blue-600 text-white font-black text-2xl rounded-xl transition-all active:scale-95 flex flex-col justify-center items-center shadow-lg border-2 border-blue-600 select-none cursor-pointer"
                  >
                    <span>右內側</span>
                    <span className="text-xs mt-2 bg-blue-900 px-2 py-0.5 rounded opacity-80 font-mono font-normal">[K 鍵]</span>
                  </button>
                  <button 
                    onMouseDown={() => triggerSaberStrike('right', 3)}
                    onTouchStart={(e) => { e.preventDefault(); triggerSaberStrike('right', 3); }}
                    className="h-28 bg-blue-600 hover:bg-blue-500 text-white font-black text-2xl rounded-xl transition-all active:scale-95 flex flex-col justify-center items-center shadow-lg border-2 border-blue-405 select-none cursor-pointer"
                  >
                    <span>右外側</span>
                    <span className="text-xs mt-2 bg-blue-800 px-2 py-0.5 rounded opacity-80 font-mono font-normal">[L 鍵]</span>
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* Menus Container (Centered Overlay) */}
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
              
              {/* LOADING STATE */}
              {gameStatus === GameStatus.LOADING && (
                  <div className={`p-10 rounded-3xl flex flex-col items-center border shadow-2xl backdrop-blur-md ${
                    isLight ? 'bg-white/95 border-slate-200 text-slate-800' : 'bg-black/95 border-blue-900/60 text-white'
                  }`}>
                      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
                      <h2 className="text-3xl font-black mb-2 tracking-wide">系統正在啟動中</h2>
                      <p className="opacity-70 font-medium">請稍候，正在配置手眼鍛鍊模組...</p>
                  </div>
              )}

              {/* IDLE STATE (Main Menu / Lobby) */}
              {gameStatus === GameStatus.IDLE && (
                  <div className={`p-8 md:p-10 rounded-3xl text-center border-2 shadow-2xl backdrop-blur-xl max-w-2xl overflow-y-auto max-h-[90vh] transition-colors duration-500 ${
                    isLight 
                      ? 'bg-white/95 border-blue-500/40 text-slate-800' 
                      : 'bg-black/92 border-blue-500/30 text-white'
                  }`}>
                      
                      {/* Logo and Greeting Header */}
                      <div className="mb-4 flex justify-center transform animate-bounce">
                         <Sparkles className="w-14 h-14 text-indigo-400" />
                      </div>
                      <h1 className={`text-4xl md:text-5xl font-black tracking-tight mb-2 italic ${
                        isLight ? 'text-indigo-800' : 'text-white'
                      }`}>
                          節奏音樂會 <span className="text-blue-500 font-extrabold">雙人合力趣</span>
                      </h1>
                      <p className="text-sm md:text-base opacity-75 font-medium mb-6">
                         專為長者設計的「手腦協調高反差音樂節奏遊戲」！快邀請家人好友一同連擊闖關吧！
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-6">
                         
                         {/* Option Column 1: Game Speed */}
                         <div className={`p-4 rounded-2xl border ${
                           isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'
                         }`}>
                            <h3 className="text-lg font-black text-blue-500 mb-2 flex items-center gap-1">
                              ⏱️ 樂音速度快慢選擇：
                            </h3>
                            <div className="space-y-2">
                               <button 
                                 onClick={() => setSpeedMultiplier(0.65)}
                                 className={`w-full py-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-between border-2 transition-all ${
                                   speedMultiplier === 0.65 
                                     ? 'bg-green-100 border-green-500 text-green-800 shadow'
                                     : 'bg-transparent border-slate-300 hover:border-slate-400'
                                 }`}
                               >
                                 <span>🐢 慢速 (長輩樂活練習)</span>
                                 <span className="font-mono bg-green-500/10 px-2 py-0.5 rounded text-xs text-green-700">0.65x 速度</span>
                               </button>
                               <button 
                                 onClick={() => setSpeedMultiplier(1.0)}
                                 className={`w-full py-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-between border-2 transition-all ${
                                   speedMultiplier === 1.0 
                                     ? 'bg-amber-100 border-amber-500 text-amber-800 shadow'
                                     : 'bg-transparent border-slate-300 hover:border-slate-400'
                                 }`}
                               >
                                 <span>🚶 普通 (輕鬆散步聽曲)</span>
                                 <span className="font-mono bg-amber-500/10 px-2 py-0.5 rounded text-xs text-amber-700 font-bold">1.00x 速度</span>
                               </button>
                               <button 
                                 onClick={() => setSpeedMultiplier(1.35)}
                                 className={`w-full py-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-between border-2 transition-all ${
                                   speedMultiplier === 1.35 
                                     ? 'bg-red-100 border-red-500 text-red-800 shadow'
                                     : 'bg-transparent border-slate-300 hover:border-slate-400'
                                 }`}
                               >
                                 <span>⚡ 快速 (挑戰眼疾手快)</span>
                                 <span className="font-mono bg-red-500/10 px-2 py-0.5 rounded text-xs text-red-700">1.35x 速度</span>
                               </button>
                            </div>
                         </div>

                         {/* Option Column 2: Controller Mode */}
                         <div className={`p-4 rounded-2xl border ${
                           isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-white/5'
                         }`}>
                            <h3 className="text-lg font-black text-indigo-500 mb-2 flex items-center gap-1">
                              🎮 遊戲感應方式選擇：
                            </h3>
                            <div className="space-y-2">
                               <button 
                                 onClick={() => setPlayMode('touch')}
                                 className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex flex-col items-start border-2 transition-all ${
                                   playMode === 'touch' 
                                     ? 'bg-indigo-100 border-indigo-500 text-indigo-800 shadow'
                                     : 'bg-transparent border-slate-300 hover:border-slate-400'
                                 }`}
                               >
                                 <div className="flex justify-between w-full items-center">
                                   <span className="font-black">📱 觸控/點擊模式 (最推薦)</span>
                                   <span className="bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px]">100% 成功</span>
                                 </div>
                                 <p className="text-xs text-left opacity-75 mt-0.5 font-normal">
                                   直接動手指輕擊畫面按鈕，支援長輩雙人坐在沙發上，一人拿一邊合力敲擊！
                                 </p>
                               </button>
                               <button 
                                 onClick={() => setPlayMode('webcam')}
                                 className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex flex-col items-start border-2 transition-all ${
                                   playMode === 'webcam' 
                                     ? 'bg-rose-100 border-rose-500 text-rose-800 shadow'
                                     : 'bg-transparent border-slate-300 hover:border-slate-400'
                                 }`}
                               >
                                 <div className="flex justify-between w-full items-center">
                                   <span className="font-black">📷 視訊鏡頭肢體辨識</span>
                                   <span className="text-[10px] opacity-60">需要相機支援</span>
                                 </div>
                                 <p className="text-xs text-left opacity-75 mt-0.5 font-normal">
                                   利用 AI 追蹤左右手掌，像揮手一樣在空中切除火花！(需要足夠光線)
                                 </p>
                               </button>
                            </div>
                         </div>
                      </div>

                      {/* AI APP INVENTOR SPECIAL WARNING FOR ELDERLY */}
                      <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-4 text-left text-xs space-y-2 text-slate-700 dark:text-slate-200">
                        <p className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          💡 MIT App Inventor 行動裝置運行重要小訣竅：
                        </p>
                        <p className="leading-relaxed">
                          MIT App Inventor 的 WebViewer 瀏覽器元件因手機系統安全限縮，常會阻擋 Webcam 視訊相機權限（引導畫面一片黑或顯示 Permission Error）。<b>遇到此狀況時非常簡單，請將配置切換為「觸控/點擊模式」</b>，即可立即享受 100% 流暢的樂活體驗！雙人合作各司其職
                        </p>
                        <p className="leading-relaxed border-t border-dashed border-slate-400/20 pt-1">
                          💻 電腦上遊玩時亦可使用<b>雙人鍵盤控制</b>：<b>玩家一</b>點選 <kbd className="bg-slate-200 dark:bg-slate-800 shadow px-1.5 py-0.5 rounded text-red-500 font-bold font-mono">S</kbd> / <kbd className="bg-slate-200 dark:bg-slate-800 shadow px-1.5 py-0.5 rounded text-red-500 font-bold font-mono">D</kbd> 控制左方軌道，<b>玩家二</b>點選 <kbd className="bg-slate-200 dark:bg-slate-800 shadow px-1.5 py-0.5 rounded text-blue-500 font-bold font-mono">K</kbd> / <kbd className="bg-slate-200 dark:bg-slate-800 shadow px-1.5 py-0.5 rounded text-blue-500 font-bold font-mono">L</kbd> 控制右方軌道！
                        </p>
                      </div>

                      {/* Start Game Action Button */}
                      <div className="mt-6">
                         {playMode === 'webcam' && !isCameraReady ? (
                              <div className="text-center p-3 text-red-500 font-bold rounded-xl bg-red-500/10 border-2 border-red-500/20 animate-pulse">
                                  ⚠️ Webcam 視訊尚在等待開啟中。若久候無反應，切換成「觸控點擊模式」即可開始！
                              </div>
                         ) : (
                             <button 
                                 onClick={startGame}
                                 className="bg-blue-600 hover:bg-blue-500 text-white text-2xl font-black py-4 px-14 rounded-full transition-all transform hover:scale-105 active:scale-95 hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] flex items-center justify-center mx-auto gap-3 cursor-pointer shadow-lg tracking-wider"
                             >
                                 <Play fill="currentColor" /> 開始合作演奏！
                             </button>
                         )}
                      </div>
                  </div>
              )}

              {/* GAME OVER & VICTORY MENU (Traditional Chinese) */}
              {(gameStatus === GameStatus.GAME_OVER || gameStatus === GameStatus.VICTORY) && (
                  <div className={`p-10 rounded-3xl text-center border-4 backdrop-blur-xl shadow-2xl transition-colors max-w-md ${
                    gameStatus === GameStatus.VICTORY 
                      ? 'border-green-500/50 bg-slate-900/90 text-white' 
                      : 'border-red-500/50 bg-slate-900/90 text-white'
                  }`}>
                      <div className="flex justify-center mb-4 text-center">
                        {gameStatus === GameStatus.VICTORY ? (
                          <CheckCircle className="w-20 h-20 text-green-400" />
                        ) : (
                          <XOctagon className="w-20 h-20 text-red-500" />
                        )}
                      </div>
                      <h2 className={`text-4xl font-extrabold mb-3 select-none ${
                        gameStatus === GameStatus.VICTORY ? 'text-green-400' : 'text-red-400'
                      }`}>
                          {gameStatus === GameStatus.VICTORY ? "🎉 演奏成功通關！" : "💔 防護力耗盡囉"}
                      </h2>
                      <p className="text-lg opacity-80 mb-5 leading-relaxed font-medium">
                        {gameStatus === GameStatus.VICTORY 
                          ? "太棒了！兩位長輩的手眼協調度絕佳，完美合力完成了這首輕快美妙的樂章！" 
                          : "別氣餒，手動動，腦動動，手腦更靈活！調整至慢速度，我們再來合力挑戰一次其樂無窮！"}
                      </p>
                      
                      <div className="bg-white/5 border border-white/10 rounded-2xl py-4 px-6 mb-6">
                         <span className="text-xs tracking-wider opacity-60 font-bold uppercase block mb-1">合力演奏最終總分數</span>
                         <span className="text-4xl font-black text-indigo-300 tracking-wider">
                           {score.toLocaleString()} 分
                         </span>
                      </div>

                      <button 
                          onClick={() => setGameStatus(GameStatus.IDLE)}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xl py-3.5 px-10 rounded-full flex items-center justify-center mx-auto gap-2 transition-all font-bold cursor-pointer border border-indigo-400 shadow active:scale-95"
                      >
                          <RefreshCw /> 返回樂廳主選單
                      </button>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default App;
