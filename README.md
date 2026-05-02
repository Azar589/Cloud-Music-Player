# Cloud Music Player (r2-music-player)

A modern, high-performance music streaming application built with React and Capacitor. Stream your music library directly from Cloudflare R2 with a premium, studio-grade matte aesthetic.

## 🌟 Features

-   **Cross-Platform Support**: Optimized for both Web and Mobile (Android/iOS) using Capacitor.
-   **Dynamic Ambient UI**: Immersive background that adapts to the current track's album art.
-   **Native Mobile Experience**: 
    - Hardware back button support.
    - Mini-player horizontal swipe gestures for track skipping.
    - Opaque, high-fidelity matte design language.
-   **Background Playback**: Keep the music going even when the app is in the background.
-   **Advanced Audio Controls**:
    - Sleep timer for late-night listening.
    - Interactive queue management.
    - Real-time equalizer visualizer.
-   **Cloud Powered**: Seamless integration with Cloudflare R2 for efficient media storage and streaming.

## 🛠️ Technology Stack

-   **Frontend**: React 19 + Vite
-   **Mobile Framework**: Capacitor 8
-   **Styling**: Vanilla CSS (Premium Matte Design System)
-   **Backend**: Cloudflare Workers & R2 Storage
-   **State Management**: React Context API

## 🚀 Getting Started

### 1. Web Development

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Start Dev Server**:
    ```bash
    npm run dev
    ```
    *The app will be available at [http://localhost:5173](http://localhost:5173)*

### 2. Mobile Development (Android)

1.  **Build the web project**:
    ```bash
    npm run build
    ```
2.  **Sync with Capacitor**:
    ```bash
    npx cap sync
    ```
3.  **Open in Android Studio**:
    ```bash
    npx cap open android
    ```

---
