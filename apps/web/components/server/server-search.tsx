"use client";
import { Search } from "lucide-react";
import React, { useEffect, useState } from "react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "../ui/command";
import { redirect, useParams } from "next/navigation";

interface ServerSearchProps {
    serverId?: string;
    data?: {
        label: string;
        type: "channel" | "member";
        data:
            | {
                  icon: React.ReactNode;
                  name: string;
                  id: string;
              }[]
            | undefined;
    }[];
}

const ServerSearch = ({ data, serverId }: ServerSearchProps) => {
    const [open, setOpen] = useState(false);
    const [isMac] = useState<boolean>(
        () =>
            typeof navigator !== "undefined" &&
            navigator.platform.includes("Mac"),
    );
    const params = useParams();

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    // autofocus the command input when dialog opens
    useEffect(() => {
        if (open) {
            const input = document.querySelector(
                '[data-slot="command-input"]',
            ) as HTMLInputElement | null;
            input?.focus();
        }
    }, [open]);

    async function onSearch({
        id,
        type,
    }: {
        id: string;
        type: "channel" | "member";
    }) {
        const sid = serverId ?? params?.serverId;
        if (!sid) {
            console.warn("ServerSearch: no serverId available for navigation");
            return;
        }

        const target =
            type == "member"
                ? `/servers/${sid}/conversation/${id}`
                : `/servers/${sid}/channels/${id}`;
        setOpen(false);
        redirect(target);
    }
    return (
        <div>
            <button
                aria-label="Open server search"
                type="button"
                className="group px-2 py-2 rounded-md flex items-center gap-x-2 w-full transition"
                onClick={() => setOpen(true)}
            >
                <Search className="w-4 h-4 " />
                <p className="font-semibold text-sm">Search</p>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
                    {isMac ? "⌘K" : "Ctrl+K"}
                </kbd>
            </button>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Search all channels and members" />
                <CommandList>
                    <CommandEmpty>No Result Found</CommandEmpty>
                    {data?.map(({ label, type, data }) => {
                        if (!data?.length) return null;
                        return (
                            <CommandGroup key={label} heading={label}>
                                {data?.map(({ id, icon, name }) => {
                                    return (
                                        <CommandItem
                                            key={id}
                                            onSelect={() =>
                                                onSearch({ id, type })
                                            }
                                            className="cursor-pointer"
                                        >
                                            <span className="mr-2 flex items-center">
                                                {icon}
                                            </span>
                                            <span className="truncate">
                                                {name}
                                            </span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        );
                    })}
                </CommandList>
            </CommandDialog>
        </div>
    );
};

export default ServerSearch;
