"use client";

import { motion } from "motion/react";
import React from "react";

interface ScrollRevealProps {
    children: React.ReactNode;
    delay?: number;
    className?: string;
    scaleHover?: boolean;
}

export function ScrollReveal({ children, delay = 0, className = "", scaleHover = false }: ScrollRevealProps) {
    const hoverProps = scaleHover 
        ? { whileHover: { scale: 1.015, y: -4 }, transition: { duration: 0.3 } } 
        : {};

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay }}
            className={className}
            {...hoverProps}
        >
            {children}
        </motion.div>
    );
}

export function ScaleReveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function HeaderReveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={className}
        >
            {children}
        </motion.h1>
    );
}
