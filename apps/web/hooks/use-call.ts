import { useCallContext } from "@/components/providers/call-provider";

export const useCall = () => {
    return useCallContext();
};
