"use client";

import { useRef, useState, useEffect } from "react";
import { Video } from "../api/feed/route";
import { Loader2 } from "lucide-react";

interface CustomPlayerProps {
    video: Video;
    initialTime?: number;
    onVideoEnd?: () => void;
    currentVideoTime?: React.MutableRefObject<number>;
    onCurrentTimeChange?: (time: number) => void;
}

declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}

export default function CustomPlayer({
    video,
    initialTime = 0,
    onVideoEnd,
    currentVideoTime,
    onCurrentTimeChange,
}: CustomPlayerProps) {
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [played, setPlayed] = useState(0);
    const [isShowingControls, setIsShowingControls] = useState(true);
    const controlsTimeoutRef = useRef<NodeJS.Timeout>();
    const [isReady, setIsReady] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Load YouTube IFrame API
    useEffect(() => {
        setMounted(true);

        // Set up callback before loading script
        window.onYouTubeIframeAPIReady = () => {
            console.log("YouTube API ready");
            if (containerRef.current && !playerRef.current) {
                initPlayer();
            }
        };

        // Load YouTube API script
        if (!window.YT) {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            tag.async = true;
            const firstScriptTag = document.getElementsByTagName("script")[0];
            firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
        } else if (window.YT?.Player) {
            // API already loaded
            initPlayer();
        }

        return () => {
            clearTimeout(controlsTimeoutRef.current);
        };
    }, []);

    const initPlayer = () => {
        if (playerRef.current || !containerRef.current) return;
        console.log("Initializing player with video ID:", video.id);

        playerRef.current = new window.YT.Player(containerRef.current, {
            height: "100%",
            width: "100%",
            videoId: video.id,
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange,
            },
            playerVars: {
                autoplay: 0,
                controls: 0,
                modestbranding: 1,
                rel: 0,
            },
        });
    };

    const onPlayerReady = () => {
        console.log("Player ready!");
        setIsReady(true);
        setDuration(playerRef.current.getDuration());
    };

    // Reinitialize when video ID changes
    useEffect(() => {
        if (!mounted || !window.YT?.Player || !containerRef.current) return;
        if (playerRef.current) {
            playerRef.current.loadVideoById(video.id);
            setIsPlaying(true);
        } else {
            initPlayer();
        }
    }, [video.id, mounted]);

    const onPlayerStateChange = (event: any) => {
        const state = event.data;
        if (state === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true);
        } else if (state === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false);
        } else if (state === window.YT.PlayerState.ENDED) {
            console.log("Video ended");
            onVideoEnd?.();
        }
    };

    // Update progress
    useEffect(() => {
        if (!isReady || !playerRef.current) return;

        const interval = setInterval(() => {
            const currentTime = playerRef.current.getCurrentTime();
            const dur = playerRef.current.getDuration();
            setDuration(dur);
            if (dur > 0) {
                setPlayed(currentTime / dur);
                // Update ref with current time
                if (currentVideoTime) {
                    currentVideoTime.current = currentTime;
                }
                // Call callback with current time for state update
                onCurrentTimeChange?.(currentTime);
                // Check if video has ended
                if (currentTime >= dur) {
                    onVideoEnd?.();
                }
            }
        }, 100);

        return () => clearInterval(interval);
    }, [isReady, onVideoEnd, currentVideoTime, onCurrentTimeChange]);

    // Seek on initialTime
    useEffect(() => {
        if (initialTime > 0 && isReady && playerRef.current) {
            playerRef.current.seekTo(initialTime);
        }
    }, [initialTime, isReady]);

    const handleMouseMove = () => {
        setIsShowingControls(true);
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) {
                setIsShowingControls(false);
            }
        }, 3000);
    };

    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
                .toString()
                .padStart(2, "0")}`;
        }
        return `${minutes}:${secs.toString().padStart(2, "0")}`;
    };

    const togglePlayPause = () => {
        if (!playerRef.current) return;
        if (isPlaying) {
            playerRef.current.pauseVideo();
        } else {
            playerRef.current.playVideo();
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPlayed = parseFloat(e.target.value);
        setPlayed(newPlayed);
        if (playerRef.current) {
            playerRef.current.seekTo(newPlayed * duration);
        }
    };

    return (
        <div
            className="relative w-full bg-black aspect-video overflow-hidden group"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => !isPlaying && setIsShowingControls(false)}
        >
            <div
                ref={containerRef}
                className="pointer-events-none"
                style={{ width: "100%", height: "100%" }}
            />

            {/* Overlay to prevent iframe interaction */}
            <div
                className="absolute inset-0 pointer-events-auto"
                style={{ zIndex: 10 }}
            />

            {/* Custom Controls */}
            <div
                className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/50 to-transparent transition-opacity duration-300 ${
                    isShowingControls ? "opacity-100" : "opacity-0"
                }`}
                style={{ zIndex: 20 }}
            >
                {/* Progress Bar */}
                <div className="h-2 w-32 bg-red-30 z-20"></div>
            </div>

            {/* Loading State */}
            {!isReady && <Loader2 className="animate-spin" />}
        </div>
    );
}
