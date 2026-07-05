"use client";
import { Plus } from "lucide-react";
import ActionTooltip from "../action-tooltip";
import { useModal } from "@/hooks/use-mode-store";

const NavigationAction = () => {
    const { onOpen } = useModal();

    return (
        <ActionTooltip label="Add a server" side="right" align="center">
            <button
                onClick={() => onOpen("createServer")}
                className="group flex items-center transition-all active:scale-95 w-full"
                aria-label="Add a server"
            >
                <div className="flex h-12 w-12 rounded-[24px] group-hover:rounded-xl transition-all overflow-hidden items-center justify-center bg-primary-color border border-primary/10 group-hover:bg-primary-color hover:rounded-xl active:bg-primary-color/90 mx-auto cursor-pointer">
                    <Plus
                        className="transition-transform group-hover:scale-110 text-white"
                        size={25}
                    />
                </div>
            </button>
        </ActionTooltip>
    );
};

export default NavigationAction;
