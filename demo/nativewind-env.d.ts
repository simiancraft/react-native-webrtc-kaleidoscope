/// <reference types="nativewind/types" />

// TypeScript 6 checks side-effect imports; global.css is consumed by NativeWind's Metro transform.
declare module '*.css';
