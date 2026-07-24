"use client";

import { useEffect } from "react";
import { HoverBorderGradient } from "@/components/HoverBorderGradient";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-4">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
                    Something went wrong
                </p>
                <h1 className="font-heading text-2xl font-semibold">
                    This page hit an unexpected error
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Your data is safe — nothing was saved incorrectly. Try again, and if it
                    keeps happening, come back in a few minutes.
                </p>
                <div className="flex justify-center pt-2">
                    <HoverBorderGradient onClick={reset}>Try again</HoverBorderGradient>
                </div>
            </div>
        </div>
    );
}
