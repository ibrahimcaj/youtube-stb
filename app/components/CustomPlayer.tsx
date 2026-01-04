// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
"use client";

import { useRef, useState, useEffect } from "react";
import { Video } from "../api/feed/route";
import { Loader2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CustomPlayerProps {
    video: Video;
    initialTime?: number;
    onVideoEnd?: () => void;
    currentVideoTime?: React.MutableRefObject<number>;
    onCurrentTimeChange?: (time: number) => void;
    onDurationChange?: (duration: number) => void;
    onFullscreenChange?: (isFullscreen: boolean) => void;
}

declare global {
    interface Window {
        YT: unknown;
        onYouTubeIframeAPIReady: () => void;
    }
}

export default function CustomPlayer({
    video,
    initialTime = 0,
    onVideoEnd,
    currentVideoTime,
    onCurrentTimeChange,
    onDurationChange,
    onFullscreenChange,
}: CustomPlayerProps) {
    const playerRef = useRef<unknown>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isShowingControls, setIsShowingControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [played, setPlayed] = useState(0);
    const fullscreenContainerRef = useRef<HTMLDivElement>(null);

    const controlsTimeoutRef = useRef<NodeJS.Timeout>();
    const [isReady, setIsReady] = useState(false);
    const [mounted, setMounted] = useState(false);

    const onPlayerReady = () => {
        console.log("[PLAYER] Ready!");

        setIsReady(true);
        lastValidTimeRef.current = 0;
    };

    const lastValidTimeRef = useRef<number>(0);

    const onPlayerStateChange = (event: unknown) => {
        const state = event.data;
        if (state === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true);
        } else if (state === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false);
        } else if (state === window.YT.PlayerState.ENDED) {
            console.log("[PLAYER] Video ended, calling onVideoEnd callback.");
            onVideoEnd?.();
        }
    };

    const initPlayer = () => {
        if (playerRef.current || !containerRef.current) return;
        console.log("[PLAYER] Initializing player with video ID:", video.id);

        playerRef.current = new window.YT.Player(containerRef.current, {
            height: "100%",
            width: "100%",
            videoId: video.id,
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange,
            },
            playerVars: {
                autoplay: 1,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                fs: 0,
            },
        });
    };

    // Load YouTube IFrame API
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);

        // Set up callback before loading script
        window.onYouTubeIframeAPIReady = () => {
            console.log("[PLAYER] YouTube API ready.");
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

    // Reinitialize when video ID changes
    useEffect(() => {
        if (!mounted || !window.YT?.Player || !containerRef.current) return;
        if (playerRef.current) {
            playerRef.current.loadVideoById(video.id);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsPlaying(true);
        } else {
            initPlayer();
        }
    }, [video.id, mounted]);

    // Update progress
    useEffect(() => {
        if (!isReady || !playerRef.current) return;

        const interval = setInterval(() => {
            const currentTime = playerRef.current.getCurrentTime();
            const dur = playerRef.current.getDuration();

            if (dur > 0) {
                setPlayed(currentTime / dur);
                // Update duration callback
                onDurationChange?.(dur);
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
    }, [isReady, onVideoEnd, currentVideoTime, onCurrentTimeChange, onDurationChange]);

    // Seek on initialTime
    useEffect(() => {
        if (initialTime > 0 && isReady && playerRef.current) {
            // Update the valid time reference so seek prevention doesn't block this
            // Move assignment before effect runs to avoid modifying a value used in effect dependencies
            (() => {
                lastValidTimeRef.current = initialTime;
            })();
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

    const toggleFullscreen = () => {
        if (!fullscreenContainerRef.current) return;

        if (!isFullscreen) {
            const elem = fullscreenContainerRef.current;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => {
                    // Fallback for mobile or restricted fullscreen
                    setIsFullscreen(true);
                    onFullscreenChange?.(true);
                });
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.webkitEnterFullscreen) {
                elem.webkitEnterFullscreen();
            } else {
                // Fallback for environments where fullscreen is not supported
                setIsFullscreen(true);
                onFullscreenChange?.(true);
            }
            setIsFullscreen(true);
            onFullscreenChange?.(true);
        } else {
            if (
                document.fullscreenElement ||
                document.webkitFullscreenElement
            ) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
            setIsFullscreen(false);
            onFullscreenChange?.(false);
        }
    };

    return (
        <div
            ref={fullscreenContainerRef}
            className={`relative bg-black overflow-hidden group ${
                isFullscreen
                    ? "fixed inset-0 z-50 w-screen h-screen"
                    : "w-full aspect-video"
            }`}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => !isPlaying && setIsShowingControls(false)}
        >
            <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

            {/* Overlay to block interactions when playing */}
            {isPlaying && (
                <div
                    className="absolute inset-0 pointer-events-auto"
                    style={{ zIndex: 15 }}
                />
            )}

            <div
                className={`absolute bottom-0 left-0 right-0 bg-linear-to-t from-black via-black/50 to-transparent transition-opacity duration-300 ${
                    isShowingControls ? "opacity-100" : "opacity-0"
                }`}
                style={{ zIndex: 20 }}
            >
                <div className="flex items-center justify-end gap-2 p-4">
                    <Button
                        onClick={toggleFullscreen}
                        variant="ghost"
                        size="icon"
                        className="hover:bg-white/20 text-white"
                        aria-label="Toggle fullscreen"
                    >
                        <Maximize size={20} />
                    </Button>
                </div>
            </div>

            {/* Loading State */}
            {!isReady && <Loader2 className="animate-spin" />}
        </div>
    );
}
