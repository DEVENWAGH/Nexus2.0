import { ShieldAlert, ShieldCheck } from "lucide-react";

export const roleIconMap = {
    GUEST: null,
    MODERATOR: <ShieldCheck className="h-4 w-4 ml-1 text-primary-color" />,
    ADMIN: <ShieldAlert className="h-4 w-4 ml-1 text-destructive" />,
};
