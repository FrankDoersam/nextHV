import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Flag } from "lucide-react";
import {
    Frame,
    FrameDescription,
    FrameFooter,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/reui/frame";
import {
    Stepper,
    StepperContent,
    StepperIndicator,
    StepperItem,
    StepperNav,
    StepperPanel,
    StepperSeparator,
    StepperTitle,
    StepperTrigger,
} from "@/components/reui/stepper";
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
export function ReuiOriginalImportWizard() {
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
        // The original ReUI CRM-6 HTML explicitly shows the Owner warning
        // on Step 2 and nevertheless navigates to the Step 3 preview.
        // This is an advisory mapping alert, not a navigation lock.
        if (step === 2 && !mappingsCount) {
            setMessage("Map at least one CSV column before previewing.");
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
            <Stepper
                value={step}
                onValueChange={(value) => {
                    if (value <= unlockedStep && value >= 1) {
                        setStep(value);
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

                    <FramePanel className="flex items-center overflow-x-auto">
                        <StepperNav className="min-w-max items-center sm:min-w-full">
                            {steps.map((label, index) => {
                                const number = index + 1;
                                return (
                                    <StepperItem
                                        key={label}
                                        step={number}
                                        disabled={number > unlockedStep}
                                        className="relative min-w-0"
                                    >
                                        <StepperTrigger className="min-w-0 justify-start gap-2 disabled:opacity-100">
                                            <StepperIndicator className="relative isolate size-6 overflow-visible rounded-full border border-background bg-accent text-foreground data-[state=inactive]:border-border data-[state=active]:border-0 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:before:absolute data-[state=active]:before:inset-0 data-[state=active]:before:rounded-full data-[state=active]:before:border data-[state=active]:before:border-dashed data-[state=active]:before:border-primary data-[state=active]:before:animate-[spin_8s_linear_infinite] motion-reduce:data-[state=active]:before:animate-none data-[state=completed]:border-primary data-[state=completed]:bg-primary data-[state=completed]:text-primary-foreground">
                                                {number < step ? <Check className="size-3.5" aria-hidden="true" /> : number}
                                            </StepperIndicator>
                                            <StepperTitle className="hidden truncate text-sm capitalize sm:block">
                                                {label}
                                            </StepperTitle>
                                        </StepperTrigger>
                                        {number < steps.length && (
                                            <StepperSeparator className="mx-2 bg-border group-data-[state=completed]/step:bg-primary" />
                                        )}
                                    </StepperItem>
                                );
                            })}
                        </StepperNav>
                    </FramePanel>

                    <FramePanel className="min-h-72">
                        <StepperPanel className="text-sm">
                            <StepperContent value={1}>
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
                            </StepperContent>
                            {view && (
                                <>
                                    <StepperContent value={2}>
                                        <MapColumnsStep
                                            view={view}
                                            target={target}
                                            mapping={mapping}
                                            isExample={isExample}
                                            onMap={(column, field) =>
                                                setMapping((current) => ({ ...current, [column]: field }))
                                            }
                                        />
                                    </StepperContent>
                                    <StepperContent value={3}>
                                        <PreviewStep view={view} mapping={mapping} target={target} isExample={isExample} uniqueKey={uniqueKey} onUniqueKey={setUniqueKey} />
                                    </StepperContent>
                                    <StepperContent value={4}>
                                        <DuplicatesStep
                                            count={duplicates}
                                            mode={duplicateMode}
                                            onModeChange={setDuplicateMode}
                                            isExample={isExample}
                                        />
                                    </StepperContent>
                                    <StepperContent value={5}>
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
                                    </StepperContent>
                                </>
                            )}
                        </StepperPanel>
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
            </Stepper>
        </form>
    );
}
