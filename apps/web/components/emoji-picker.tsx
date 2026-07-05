"use client";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Smile } from "lucide-react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { useTheme } from "next-themes";

interface EmojiPickerProps {
    onChange: (value: string) => void;
}

const EmojiPicker = ({ onChange }: EmojiPickerProps) => {
    const { resolvedTheme } = useTheme();
    const theme = resolvedTheme === "dark" ? "dark" : "light";

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="h-9 w-9 flex items-center justify-center rounded-full bg-zinc-200/50 dark:bg-zinc-700/50 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-all duration-300 text-zinc-500 dark:text-zinc-400"
                >
                    <Smile className="h-5 w-5" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="right"
                sideOffset={40}
                className="bg-transparent border-none shadow-none drop-shadow-none mb-16"
            >
                <Picker
                    data={data}
                    theme={theme}
                    onEmojiSelect={(emoji: { native?: string }) =>
                        onChange(emoji.native ?? "")
                    }
                />
            </PopoverContent>
        </Popover>
    );
};

export default EmojiPicker;
