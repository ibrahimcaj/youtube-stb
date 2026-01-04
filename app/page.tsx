"use client";

import { useEffect, useRef, useState } from "react";
import CustomPlayer from "./components/CustomPlayer";
import { Video } from "./api/feed/route";
import {
    BookmarkIcon,
    ChevronRight,
    Loader2,
    RefreshCcw,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Sidebar,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import { Subscription } from "./api/subscriptions/route";
import Image from "next/image";
import { Toggle } from "@/components/ui/toggle";
import { Item } from "@/components/ui/item";

export default function Home() {
    const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
    const [before, setBefore] = useState<Video[]>([]);
    const [after, setAfter] = useState<Video[]>([]);
    const [startTime, setStartTime] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [afterCount, setAfterCount] = useState(0);

    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState("Fetching timeline...");

    const currentVideoTime = useRef(0);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoadingStatus("Fetching timeline...");
        fetch(`/api/timeline`)
            .then((response) => {
                if (response.status === 204) {
                    // Feed is empty, refresh it
                    setLoadingStatus("Refreshing feed...");
                    return fetch(`/api/feed`, { method: "GET" }).then(() => {
                        setLoadingStatus("Feed refreshed. Fetching videos...");
                        return fetch(`/api/timeline`);
                    });
                }
                return Promise.resolve(response);
            })
            .then((response) => response.json())
            .then((data) => {
                console.log(data);
                console.log(data.current.timestamp);
                setCurrentVideo(data.current?.video || null);
                setStartTime(data.current.timestamp);
                setBefore(data.before || []);
                setAfter(data.after || []);
                setAfterCount(data.afterCount || 0);
                setLoadingStatus("Loaded");
            })
            .catch((error) => {
                console.error("Error fetching timeline:", error);
                setLoadingStatus("Error loading timeline");
            });

        fetch(`/api/subscriptions`)
            .then((response) => response.json())
            .then((data) => {
                console.log(data.items);
                setSubscriptions(data.items || []);
            })
            .catch((error) => console.error("Error fetching timeline:", error));
    }, []);

    if (!currentVideo) {
        return (
            <div className="w-full min-h-screen flex flex-col justify-center items-center gap-4">
                <Loader2 className="animate-spin text-gray-500" />
                <p className="text-xs text-gray-500">{loadingStatus}</p>
            </div>
        );
    }

    function handleToggleSubscription(channelId: string) {
        fetch(`/api/subscriptions/${channelId}`, {
            method: "POST",
        }).catch((error) =>
            console.error("Error toggling subscription:", error)
        );
    }

    function handleFeedRefresh() {
        setIsRefreshing(true);
        fetch(`/api/feed`, {
            method: "GET",
        })
            .then(() => setIsRefreshing(false))
            .catch((error) => {
                console.error("Error refreshing feed:", error);
                setIsRefreshing(false);
            });
    }

    const handleVideoEnd = () => {
        if (after.length > 0) {
            const nextVideo = after[0];

            // Refetch the timeline with the next video
            fetch(`/api/timeline`)
                .then((response) => response.json())
                .then((data) => {
                    setCurrentVideo(data.current?.video || null);
                    setStartTime(data.current.timestamp);
                    setBefore(data.before || []);
                    setAfter(data.after || []);
                })
                .catch((error) =>
                    console.error("Error fetching timeline:", error)
                );
        }
    };

    return (
        <SidebarProvider defaultOpen={false}>
            <div className="w-screen h-screen bg-black flex flex-col items-center justify-center">
                <CustomPlayer
                    video={currentVideo}
                    initialTime={startTime}
                    onVideoEnd={handleVideoEnd}
                    currentVideoTime={currentVideoTime}
                    onCurrentTimeChange={setCurrentTime}
                />

                <div className="w-auto md:w-full flex flex-col md:flex-row justify-between items-center group">
                    <div className="w-screen md:w-full flex flex-row items-center overflow-x-scroll transition-opacity duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                        {/* <div className="flex flex-row gap-2">
                    {before.map((video) => (
                        <VideoCard
                            key={video.id}
                            video={video}
                            classNames="grayscale"
                        />
                    ))}
                </div> */}
                        <div className="relative flex flex-row gap-2 flex-shrink-0">
                            <div
                                className="absolute flex w-[1px] h-[128px] bg-red-500 rounded-lg"
                                style={{
                                    translate:
                                        128 *
                                        (currentTime / currentVideo.duration),
                                }}
                            ></div>
                            <VideoCard
                                key={currentVideo.id}
                                video={currentVideo}
                            />
                        </div>
                        <div className="flex flex-row items-center gap-2 flex-shrink-0">
                            {after.map((video) => (
                                <VideoCard key={video.id} video={video} />
                            ))}
                            <div className="flex flex-col items-center mx-4">
                                <div className="flex-row">
                                    <ChevronRight
                                        size={12}
                                        className="inline text-neutral-500 -mr-1"
                                    />
                                    <ChevronRight
                                        size={12}
                                        className="inline text-neutral-500 -mr-1"
                                    />
                                    <ChevronRight
                                        size={12}
                                        className="inline text-neutral-500"
                                    />
                                </div>
                                <p className="text-nowrap -mt-1 text-xs text-neutral-500">
                                    +{afterCount} videos
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-row items-center gap-2 mr-6 my-12 px-6">
                        <SidebarTrigger>
                            <Users />
                        </SidebarTrigger>
                        <Button
                            size="sm"
                            onClick={() => handleFeedRefresh()}
                            disabled={isRefreshing}
                        >
                            <RefreshCcw
                                className={isRefreshing ? "animate-spin" : ""}
                            />
                        </Button>
                    </div>
                </div>
            </div>

            <Sidebar side="right" defaultValue={0}>
                <div className="flex flex-col gap-2 p-4 overflow-y-scroll overflow-x-hidden">
                    {subscriptions.map((sub) => (
                        <Item
                            variant="outline"
                            key={sub.channelId}
                            className="flex flex-nowrap flex-row items-center justify-between gap-2 text-ellipsis p-2! h-fit! rounded-lg"
                        >
                            {/* <div className="flex flex-row flex-1 gap-2 items-center"> */}
                            <Image
                                src={sub.thumbnails.default.url}
                                alt={sub.title}
                                width={32}
                                height={32}
                                className="aspect-square w-8 rounded-full flex flex-row gap-1"
                            />
                            <p className="text-sm text-ellipsis line-clamp-1 mr-auto">
                                {sub.title}
                            </p>
                            {/* </div> */}
                            <Toggle
                                aria-label="Toggle bookmark"
                                size="sm"
                                variant="outline"
                                defaultPressed={sub.enabled}
                                onPressedChange={() =>
                                    handleToggleSubscription(sub.channelId)
                                }
                                className="data-[state=on]:bg-transparent data-[state=on]:*:[svg]:fill-blue-500 data-[state=on]:*:[svg]:stroke-blue-500"
                            >
                                <BookmarkIcon />
                            </Toggle>
                        </Item>
                    ))}
                </div>
            </Sidebar>
        </SidebarProvider>
    );
}

function VideoCard({
    video,
    classNames,
}: {
    video: Video;
    classNames?: string;
}) {
    return (
        <div className="w-[128px] flex-shrink-0 flex flex-col p-1">
            <img
                src={video.thumbnail.medium.url}
                alt={video.title}
                className={`w-full mb-2 ${classNames} aspect-video object-cover rounded-lg`}
            />

            <div className="text-white text-xs text-ellipsis line-clamp-2">
                {video.title}
            </div>
            <div className="text-neutral-400 text-xs text-ellipsis line-clamp-2">
                {video.channelTitle}
            </div>
        </div>
    );
}
