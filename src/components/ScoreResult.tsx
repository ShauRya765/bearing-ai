import type { CrsScore } from "@/lib/crs/engine/crs-core";
import type { GateResult } from "@/lib/crs/engine/gate";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { deriveDrawStatus, TONE_DOT } from "@/components/score-summary";

// The GATE headline, in full: leads the detail section with the honest,
// differentiated answer. The one-line version rides the sticky bar; this is the
// same status expanded with its reasoning.
function DrawStatusBanner({ gate }: { gate: GateResult }) {
    const status = deriveDrawStatus(gate);
    const styles = {
        clear: "border-clear/30 bg-clear/10",
        primary: "border-primary/30 bg-primary/10",
        refuse: "border-border bg-muted",
    }[status.tone];

    return (
        <div className={`rounded-xl border p-4 ${styles}`}>
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[status.tone]}`} aria-hidden />
                <p className="text-sm font-medium text-foreground">{status.heading}</p>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{status.body}</p>
        </div>
    );
}

// Factor breakdown: each row's thin proportional bar (points / max) makes the
// mix scannable at a glance. Neutral ink so the amber/green accent stays
// reserved for genuine signal (the meter, the GATE status).
export function ScoreResult({ score, gate }: { score: CrsScore; gate: GateResult }) {
    return (
        <>
            <DrawStatusBanner gate={gate} />

            <Card>
                <CardHeader>
                    <CardTitle>Score breakdown</CardTitle>
                    <CardDescription>Where every point comes from — IRCC tables, never an estimate.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {score.factors.map((f) => {
                        const pct = f.max > 0 ? (f.points / f.max) * 100 : 0;
                        return (
                            <div key={f.factor} className="space-y-1.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{f.factor}</span>
                                    <span className="font-mono tabular-nums text-foreground">
                                        {f.points}
                                        <span className="text-muted-foreground"> / {f.max}</span>
                                    </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-muted-foreground/70 transition-[width] duration-300"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </>
    );
}
