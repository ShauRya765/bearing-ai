import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-4">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
                    404
                </p>
                <h1 className="font-heading text-2xl font-semibold">
                    We couldn&apos;t find that page
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    The page may have moved. Head back to your assessment to keep going.
                </p>
                <div className="pt-2">
                    <Link
                        href="/"
                        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                        Back to assessment
                    </Link>
                </div>
            </div>
        </div>
    );
}
