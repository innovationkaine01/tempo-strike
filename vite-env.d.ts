/// <reference types="vite/client" />
import { ReactThreeFiber } from '@react-three/fiber';

declare global {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IntrinsicElements extends ReactThreeFiber.IntrinsicElements {}
  }
}
