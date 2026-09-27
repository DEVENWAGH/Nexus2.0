import React from "react";
import { Outfit } from "next/font/google";

const outfit = Outfit({
    variable: "--font-outfit",
    subsets: ["latin"],
});

const layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className={`${outfit.variable}`} suppressHydrationWarning>
            {children}
        </div>
    );
};

export default layout;
