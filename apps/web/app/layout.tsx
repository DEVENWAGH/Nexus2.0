import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-context";
import { Toaster } from "@/components/ui/sonner";


export const dynamic = "force-dynamic";

const spaceGrotesk = Space_Grotesk({
    variable: "--font-space-grotesk",
    subsets: ["latin"],
});

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Nexus - Community",
    description:
        "Nexus community application is a great for conversations and chilling with friends, or even building a worldwide community. Customize your own space to talk, play, and hang out.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var o=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(typeof n==='string'&&(n==='bis_skin_checked'||n.startsWith('bis_'))){return;}return o.apply(this,arguments);};var m=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var mut=muts[i];if(mut.type==='attributes'&&mut.attributeName&&(mut.attributeName==='bis_skin_checked'||mut.attributeName.startsWith('bis_'))){mut.target.removeAttribute(mut.attributeName);}}});m.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['bis_skin_checked']});document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[bis_skin_checked]').forEach(function(el){el.removeAttribute('bis_skin_checked');});});}catch(e){}})();`,
                    }}
                />
            </head>
            <body
                className={`${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable} antialiased`}
                suppressHydrationWarning
            >

                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem={true}
                    storageKey="nexus-theme"
                >
                    <LanguageProvider>
                        {children}
                        <Toaster />
                    </LanguageProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
