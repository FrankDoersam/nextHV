import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Flag } from "lucide-react";
import {
    Frame,
    FrameDescription,
    FrameFooter,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/reui/frame";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WizardTabsNavigation, type WizardTab } from "./wizard-tabs";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ImportUploadStep } from "./upload-step";
import {
    DuplicatesStep,
    MapColumnsStep,
    mappedField,
    PreviewStep,
    SummaryStep,
    type DuplicateMode,
} from "./steps";
import {
    exampleFiles,
    loadSelectedFiles,
    previewDuplicateCount,
    targetOptions,
    viewForFile,
    type ImportTarget,
    type WizardFile,
} from "./model";

const steps = ["Upload", "Map Columns", "Preview", "Duplicates", "Summary"];
const footerHints = [
    "Pick files and target object.",
    "Match 8 columns to CRM fields.",
    "Validate the first rows.",
    "Choose how matches merge.",
    "Run the import.",
];

/** ReUI Nova visual reconstruction from all five provided HTML snapshots.
 * Local-only demo: no real CRM import or database mutation.
 */
export function ImportWizardDemo() {
    const [step, setStep] = useState(1);
    const [unlockedStep, setUnlockedStep] = useState(1);
    const [files, setFiles] = useState<WizardFile[]>(() => exampleFiles);
    const [target, setTarget] = useState<ImportTarget>("contacts");
    const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
    const [uniqueKey, setUniqueKey] = useState("email");
    const [reading, setReading] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [message, setMessage] = useState<string>();

    const source = files.find((file) => file.kind === "csv" && file.data);
    const isExample = !!source?.example;
    const view = useMemo(
        () => viewForFile(source, firstRowIsHeader),
        [source, firstRowIsHeader],
    );
    const mappingsCount = view?.columns.filter(
        (column) => mappedField(column, mapping, target) !== "skip",
    ).length ?? 0;
    const duplicates = useMemo(
        () => previewDuplicateCount(view, mapping),
        [view, mapping],
    );

    const resetSteps = () => {
        setStep(1);
        setUnlockedStep(1);
        setMapping({});
        setDuplicateMode("skip");
        setUniqueKey("email");
        setCompleted(false);
        setMessage(undefined);
    };

    const addFiles = async (selected: File[]) => {
        if (!selected.length || reading) return;
        setReading(true);
        setMessage(undefined);
        try {
            const result = await loadSelectedFiles(selected);
            if (result.files.length) {
                setFiles((previous) => [
                    ...previous.filter(
                        (entry) =>
                            !entry.example &&
                            !result.files.some((file) => file.name === entry.name),
                    ),
                    ...result.files,
                ]);
                resetSteps();
            }
            if (result.errors.length) setMessage(result.errors.join(" "));
        } catch {
            setMessage("Cannot read selected files.");
        } finally {
            setReading(false);
        }
    };

    const next = () => {
        setMessage(undefined);
        if (step === 1 && !view) {
            setMessage("Select a CSV file to preview. Excel files need a separate import parser.");
            return;
        }
        if (step === 2 && (!mappingsCount || (target === "contacts" &&
            ["fullName", "email", "owner"].some((required) =>
                !view?.columns.some((column) => mappedField(column, mapping, target) === required))))) {
            setMessage("Map the required Full name, Email and Owner fields before continuing.");
            return;
        }
        if (step === 5) {
            setCompleted(true);
            return;
        }
        setStep((current) => current + 1);
        setUnlockedStep((current) => Math.max(current, step + 1));
    };

    const fileSummary = files.length
        ? files[0].name + (files.length > 1 ? " + " + (files.length - 1) + " file" + (files.length > 2 ? "s" : "") : "")
        : "No files selected";

    return (
        <form
            aria-label="CSV import wizard"
            data-slot="import-wizard-demo"
            className="mx-auto flex w-full max-w-3xl flex-col"
            onSubmit={(event) => {
                event.preventDefault();
                next();
            }}
        >
            <Tabs
                value={String(step)}
                onValueChange={(value) => {
                    const selected = Number(value);
                    if (Number.isInteger(selected) && selected <= unlockedStep && selected >= 1) {
                        setStep(selected);
                        setMessage(undefined);
                    }
                }}
            >
                <Frame className="w-full" stacked>
                    <FrameHeader>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-col gap-px">
                                <FrameTitle>Import Wizard</FrameTitle>
                                <FrameDescription className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate">{fileSummary}</span>
                                    {view && (
                                        <>
                                            <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-muted-foreground/40" />
                                            <span className="shrink-0">
                                                {view.totalRows.toLocaleString("en-US")} rows
                                            </span>
                                        </>
                                    )}
                                </FrameDescription>
                            </div>
                            <Badge variant="info-light" className="shrink-0">
                                {targetOptions.find((option) => option.value === target)?.label}
                            </Badge>
                        </div>
                    </FrameHeader>

                    <FramePanel className="pb-0">
                        <WizardTabsNavigation
                            unlockedStep={unlockedStep}
                            steps={steps.map((label, index): WizardTab => ({
                                value: String(index + 1),
                                label,
                                ...(index === 1 && view ? {
                                    badge: { value: mappingsCount + "/" + view.columns.length, variant: "primary-light" },
                                } : {}),
                                ...(index === 2 && view ? {
                                    badge: { value: Math.min(view.rows.length, 5), variant: "info-light" },
                                } : {}),
                                ...(index === 3 && view ? {
                                    badge: { value: isExample ? 36 : duplicates, variant: "warning-light" },
                                } : {}),
                            }))}
                        />
                    </FramePanel>

                    <FramePanel className="min-h-72">
                        <div className="text-sm">
                            <TabsContent value="1">
                                <ImportUploadStep
                                    files={files}
                                    onAdd={(selection) => void addFiles(selection)}
                                    onRemove={(id) => {
                                        setFiles((current) => current.filter((file) => file.id !== id));
                                        resetSteps();
                                    }}
                                    target={target}
                                    onTargetChange={(value) => {
                                        setTarget(value);
                                        resetSteps();
                                    }}
                                    firstRowIsHeader={firstRowIsHeader}
                                    onHeaderChange={(value) => {
                                        setFirstRowIsHeader(value);
                                        resetSteps();
                                    }}
                                    reading={reading}
                                />
                            </TabsContent>
                            {view && (
                                <>
                                    <TabsContent value="2">
                                        <MapColumnsStep
                                            view={view}
                                            target={target}
                                            mapping={mapping}
                                            isExample={isExample}
                                            onMap={(column, field) =>
                                                setMapping((current) => ({ ...current, [column]: field }))
                                            }
                                        />
                                    </TabsContent>
                                    <TabsContent value="3">
                                        <PreviewStep view={view} mapping={mapping} target={target} isExample={isExample} uniqueKey={uniqueKey} onUniqueKey={setUniqueKey} />
                                    </TabsContent>
                                    <TabsContent value="4">
                                        <DuplicatesStep
                                            count={duplicates}
                                            mode={duplicateMode}
                                            onModeChange={setDuplicateMode}
                                            isExample={isExample}
                                        />
                                    </TabsContent>
                                    <TabsContent value="5">
                                        <SummaryStep
                                            view={view}
                                            target={target}
                                            files={fileSummary}
                                            duplicateMode={duplicateMode}
                                            uniqueKey={uniqueKey}
                                            duplicates={duplicates}
                                            isExample={isExample}
                                            completed={completed}
                                        />
                                    </TabsContent>
                                </>
                            )}
                        </div>
                        {message && (
                            <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                {message}
                            </p>
                        )}
                    </FramePanel>

                    <FrameFooter className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                            <Flag aria-hidden="true" className="size-4 shrink-0" />
                            {footerHints[step - 1]}
                        </p>
                        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                            {step > 1 && (
                                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                                    <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                                    Back
                                </Button>
                            )}
                            <Button type="submit" disabled={reading || completed}>
                                {step === 5 ? (completed ? "Done" : "Import") : "Next Step"}
                                {step < 5 && <ArrowRight data-icon="inline-end" aria-hidden="true" />}
                            </Button>
                        </div>
                    </FrameFooter>
                </Frame>
            </Tabs>
        </form>
    );
}
