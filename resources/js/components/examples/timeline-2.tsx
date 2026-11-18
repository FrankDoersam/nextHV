import { DownloadIcon, PaperclipIcon, XIcon } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/reui/badge";
import { Rating } from "@/components/reui/rating";
import {
    Timeline,
    TimelineActions,
    TimelineContent,
    TimelineDate,
    TimelineDescription,
    TimelineHeader,
    TimelineIndicator,
    TimelineItem,
    TimelineMeta,
    TimelineSeparator,
    TimelineTitle,
} from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type Timeline2Attachment = {
    name: string;
    size: string;
    href: string;
    preview: string;
};

export type Timeline2Entry = {
    id: string;
    date: string;
    dateTime: string;
    action: string;
    title: string;
    description: string;
    person: string;
    indicatorClassName: string;
    badge: { label: string; variant: BadgeProps["variant"] };
    status: { label: string; dotClassName: string };
    attachment?: Timeline2Attachment;
    rating?: number;
};

function downloadAttachment(attachment: Timeline2Attachment) {
    const anchor = document.createElement("a");
    anchor.href = attachment.href;
    anchor.download = attachment.name;
    anchor.click();
}

function TimelineAttachment({
    attachment,
}: {
    attachment: Timeline2Attachment;
}) {
    return (
        <div className="py-1">
            <Dialog>
                <ButtonGroup aria-label={attachment.name}>
                    <DialogTrigger
                        data-slot="button"
                        render={<Button variant="outline" size="sm" />}
                    >
                        <PaperclipIcon aria-hidden className="size-3.5" />
                        {attachment.name}
                        <span className="opacity-60">({attachment.size})</span>
                    </DialogTrigger>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Download ${attachment.name}`}
                        onClick={() => downloadAttachment(attachment)}
                    >
                        <DownloadIcon aria-hidden />
                    </Button>
                </ButtonGroup>
                <DialogContent
                    lang="de"
                    showCloseButton={false}
                    className="sm:max-w-xl"
                >
                    <DialogHeader className="pr-8">
                        <DialogTitle>{attachment.name}</DialogTitle>
                        <DialogDescription>
                            Demo-Vorschau mit fiktiven Daten. Die Beispieldatei
                            kann heruntergeladen werden.
                        </DialogDescription>
                    </DialogHeader>
                    <pre
                        lang="en"
                        className="max-h-[50dvh] overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-relaxed whitespace-pre-wrap break-words"
                    >
                        {attachment.preview}
                    </pre>
                    <div className="flex justify-end">
                        <Button onClick={() => downloadAttachment(attachment)}>
                            <DownloadIcon aria-hidden />
                            Herunterladen
                        </Button>
                    </div>
                    <DialogClose
                        aria-label="Schließen"
                        render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="absolute top-4 right-4"
                            />
                        }
                    >
                        <XIcon aria-hidden />
                    </DialogClose>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** ReUI timeline-2 from the supplied HTML, composed from the installed primitives. */
export function Timeline2({
    entries,
    className,
}: {
    entries: Timeline2Entry[];
    className?: string;
}) {
    return (
        <div
            data-slot="reui-timeline-2"
            lang="en"
            className={cn("w-full max-w-sm", className)}
        >
            <Timeline
                variant="activity"
                orientation="vertical"
                aria-label="Activity timeline"
            >
                {entries.map((entry, index) => (
                    <TimelineItem key={entry.id} step={index + 1}>
                        <TimelineHeader>
                            <TimelineSeparator />
                            <TimelineIndicator
                                className={entry.indicatorClassName}
                            />
                            <TimelineDate dateTime={entry.dateTime}>
                                {entry.date}
                            </TimelineDate>
                        </TimelineHeader>
                        <TimelineContent>
                            <TimelineTitle render={<p />}>
                                <span className="text-muted-foreground">
                                    {entry.action}
                                </span>{" "}
                                <span className="font-medium">
                                    {entry.title}
                                </span>
                            </TimelineTitle>
                            <TimelineDescription>
                                {entry.description}
                            </TimelineDescription>
                            {(entry.attachment ||
                                entry.rating !== undefined) && (
                                <TimelineActions>
                                    {entry.attachment && (
                                        <TimelineAttachment
                                            attachment={entry.attachment}
                                        />
                                    )}
                                    {entry.rating !== undefined && (
                                        <Rating
                                            rating={entry.rating}
                                            size="sm"
                                            showValue
                                            className="py-1"
                                            role="img"
                                            aria-label={`${entry.rating} out of 5 stars`}
                                        />
                                    )}
                                </TimelineActions>
                            )}
                            <TimelineMeta>
                                <span className="truncate text-sm text-muted-foreground">
                                    {entry.person}
                                </span>
                                <Badge variant={entry.badge.variant}>
                                    {entry.badge.label}
                                </Badge>
                                <Badge variant="outline" className="gap-1.5">
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "size-1.5 rounded-full",
                                            entry.status.dotClassName,
                                        )}
                                    />
                                    {entry.status.label}
                                </Badge>
                            </TimelineMeta>
                        </TimelineContent>
                    </TimelineItem>
                ))}
            </Timeline>
        </div>
    );
}

const demoEntries: Timeline2Entry[] = [
    {
        id: "handoff",
        date: "May 06, 2026",
        dateTime: "2026-05-06",
        action: "Completed",
        title: "Renewal Workspace Handoff",
        description:
            "Success plan, contract notes, and expansion risks are ready for the account team.",
        person: "Maya Brooks",
        indicatorClassName: "bg-emerald-500",
        badge: { label: "Done", variant: "success-light" },
        status: { label: "Healthy", dotClassName: "bg-success" },
        attachment: {
            name: "Handoff.pdf",
            size: "1.8 MB",
            href: "/demo/timeline-2/Handoff.pdf",
            preview:
                "Renewal Workspace Handoff\nDemo document - fictional account data\n\nOwner: Maya Brooks\nCompleted: May 06, 2026\nStatus: Healthy\n\nSuccess plan, contract notes, and expansion risks are ready for the account team.\n\nNext steps\n- Review the success plan with the account team.\n- Confirm the renewal milestones.\n- Track expansion risks in the next account review.",
        },
        rating: 4.8,
    },
    {
        id: "sso",
        date: "May 02, 2026",
        dateTime: "2026-05-02",
        action: "Verified",
        title: "SSO And SCIM Sync",
        description:
            "Directory groups match workspace roles before admin invitations are released.",
        person: "Nina Patel",
        indicatorClassName: "bg-blue-500",
        badge: { label: "Auth", variant: "info-light" },
        status: { label: "Low Risk", dotClassName: "bg-info" },
        attachment: {
            name: "SSO-map.csv",
            size: "84 KB",
            href: "/demo/timeline-2/SSO-map.csv",
            preview:
                "directory_group,workspace_role,sync_status\naccount-admins,Admin,Verified\naccount-managers,Manager,Verified\naccount-viewers,Viewer,Verified\n",
        },
    },
    {
        id: "billing",
        date: "Apr 28, 2026",
        dateTime: "2026-04-28",
        action: "Approved",
        title: "Usage-Based Billing Limits",
        description:
            "Finance confirmed seat buffers and usage caps for the renewal workspace.",
        person: "Theo Grant",
        indicatorClassName: "bg-violet-500",
        badge: { label: "Limit", variant: "primary-light" },
        status: { label: "125% Cap", dotClassName: "bg-primary" },
    },
    {
        id: "import",
        date: "Apr 22, 2026",
        dateTime: "2026-04-22",
        action: "Imported",
        title: "Production Customer Records",
        description:
            "Customer contacts, renewal dates, and usage snapshots cleared validation.",
        person: "Leah Stone",
        indicatorClassName: "bg-fuchsia-500",
        badge: { label: "Data", variant: "warning-light" },
        status: { label: "18.4k Rows", dotClassName: "bg-warning" },
        attachment: {
            name: "Import-log.txt",
            size: "26 KB",
            href: "/demo/timeline-2/Import-log.txt",
            preview:
                "Production Customer Records\nDemo log - fictional import\n\nDate: Apr 22, 2026\nOwner: Leah Stone\nValidated rows: 18400\nErrors: 0\n\nCustomer contacts, renewal dates, and usage snapshots cleared validation.\n",
        },
    },
];

export function ReuiTimelineDemo() {
    return <Timeline2 entries={demoEntries} />;
}
