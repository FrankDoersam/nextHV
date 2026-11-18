"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"

// Types
type TimelineVariant = "default" | "activity"

type TimelineContextValue = {
  activeStep: number
  setActiveStep: (step: number) => void
  variant: TimelineVariant
}

// Context
const TimelineContext = createContext<TimelineContextValue | undefined>(
  undefined,
)

const useTimeline = () => {
  const context = useContext(TimelineContext)
  if (!context) {
    throw new Error("useTimeline must be used within a Timeline")
  }
  return context
}

// Components
interface TimelineProps extends useRender.ComponentProps<"div"> {
  defaultValue?: number
  value?: number
  onValueChange?: (value: number) => void
  orientation?: "horizontal" | "vertical"
  variant?: TimelineVariant
}

function Timeline({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = "vertical",
  variant = "default",
  className,
  render,
  children,
  ...props
}: TimelineProps) {
  const [activeStep, setInternalStep] = useState(defaultValue)

  const setActiveStep = useCallback(
    (step: number) => {
      if (value === undefined) {
        setInternalStep(step)
      }
      onValueChange?.(step)
    },
    [value, onValueChange],
  )

  const currentStep = value ?? activeStep

  const defaultProps = {
    className: cn(
      "group/timeline flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col",
      className,
    ),
    "data-orientation": orientation,
    "data-variant": variant,
    "data-slot": "timeline",
    role: variant === "activity" ? "list" : undefined,
    children,
  }

  return (
    <TimelineContext.Provider
      value={{ activeStep: currentStep, setActiveStep, variant }}
    >
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </TimelineContext.Provider>
  )
}

// TimelineContent
function TimelineContent({
  className,
  render,
  children,
  ...props
}: useRender.ComponentProps<"div">) {
  const variant = useContext(TimelineContext)?.variant ?? "default"
  const defaultProps = {
    className: cn(
      variant === "activity"
        ? "min-w-0 space-y-1 pt-1 text-sm font-medium text-foreground"
        : "text-muted-foreground text-sm",
      className,
    ),
    "data-slot": "timeline-content",
    children,
  }

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

// TimelineDate
type TimelineDateProps = useRender.ComponentProps<"time">

function TimelineDate({
  className,
  render,
  children,
  ...props
}: TimelineDateProps) {
  const variant = useContext(TimelineContext)?.variant ?? "default"
  const defaultProps = {
    className: cn(
      "block group-data-[orientation=vertical]/timeline:max-sm:h-4",
      variant === "activity"
        ? "mb-0 text-[11px] font-semibold text-muted-foreground/60 uppercase"
        : "mb-1 font-medium text-muted-foreground text-xs",
      className,
    ),
    "data-slot": "timeline-date",
    children,
  }

  return useRender({
    defaultTagName: "time",
    render,
    props: mergeProps<"time">(defaultProps, props),
  })
}

// TimelineHeader
function TimelineHeader({
  className,
  render,
  children,
  ...props
}: useRender.ComponentProps<"div">) {
  const defaultProps = {
    className: cn(className),
    "data-slot": "timeline-header",
    children,
  }

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

// TimelineIndicator
type TimelineIndicatorProps = useRender.ComponentProps<"div">

function TimelineIndicator({
  className,
  children,
  render,
  ...props
}: TimelineIndicatorProps) {
  const variant = useContext(TimelineContext)?.variant ?? "default"
  const defaultProps = {
    "aria-hidden": true,
    className: cn(
      "group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute rounded-full group-data-[orientation=horizontal]/timeline:left-0",
      variant === "activity"
        ? "size-2 border-0 bg-primary group-data-[orientation=vertical]/timeline:top-1"
        : "size-4 border-2 border-primary/20 group-data-[orientation=vertical]/timeline:top-0 group-data-completed/timeline-item:border-primary",
      className,
    ),
    "data-slot": "timeline-indicator",
    children,
  }

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

// TimelineItem
interface TimelineItemProps extends useRender.ComponentProps<"div"> {
  step: number
}

function TimelineItem({
  step,
  className,
  render,
  children,
  ...props
}: TimelineItemProps) {
  const { activeStep, variant } = useTimeline()

  const defaultProps = {
    className: cn(
      "group/timeline-item relative flex min-w-0 flex-1 flex-col gap-0.5 group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=horizontal]/timeline:mt-8 group-data-[orientation=horizontal]/timeline:not-last:pe-8 group-data-[orientation=vertical]/timeline:not-last:pb-6",
      variant === "default" &&
        "has-[+[data-completed]]:**:data-[slot=timeline-separator]:bg-primary",
      className,
    ),
    "data-completed":
      (variant === "default" && step <= activeStep) || undefined,
    "data-slot": "timeline-item",
    role: variant === "activity" ? "listitem" : undefined,
    children,
  }

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

// TimelineSeparator
function TimelineSeparator({
  className,
  render,
  children,
  ...props
}: useRender.ComponentProps<"div">) {
  const variant = useContext(TimelineContext)?.variant ?? "default"
  const defaultProps = {
    "aria-hidden": true,
    className: cn(
      "group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute self-start group-last/timeline-item:hidden group-data-[orientation=horizontal]/timeline:h-0.5 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.25rem)] group-data-[orientation=horizontal]/timeline:w-[calc(100%-1.25rem)] group-data-[orientation=vertical]/timeline:w-0.5 group-data-[orientation=horizontal]/timeline:translate-x-4.5 group-data-[orientation=vertical]/timeline:translate-y-4.5",
      variant === "activity" ? "bg-border" : "bg-primary/10",
      className,
    ),
    "data-slot": "timeline-separator",
    children,
  }

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

// TimelineTitle
function TimelineTitle({
  className,
  render,
  children,
  ...props
}: useRender.ComponentProps<"h3">) {
  const variant = useContext(TimelineContext)?.variant ?? "default"
  const defaultProps = {
    className: cn(
      "font-medium text-sm",
      variant === "activity" && "leading-snug",
      className,
    ),
    "data-slot": "timeline-title",
    children,
  }

  return useRender({
    defaultTagName: "h3",
    render,
    props: mergeProps<"h3">(defaultProps, props),
  })
}

function TimelineDescription({
  className,
  render,
  ...props
}: useRender.ComponentProps<"p">) {
  const defaultProps = {
    "data-slot": "timeline-description",
    className: cn(
      "line-clamp-2 text-xs leading-snug font-normal text-muted-foreground",
      className,
    ),
  }
  return useRender({
    defaultTagName: "p",
    render,
    props: mergeProps<"p">(defaultProps, props),
  })
}

function TimelineActions({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  const defaultProps = {
    "data-slot": "timeline-actions",
    className: cn("flex flex-wrap items-center gap-2 pt-0.5", className),
  }
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

function TimelineMeta({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  const defaultProps = {
    "data-slot": "timeline-meta",
    className: cn("flex flex-wrap items-center gap-1.5 pt-0.5", className),
  }
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  })
}

export {
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
  type TimelineProps,
  type TimelineItemProps,
  type TimelineDateProps,
  type TimelineIndicatorProps,
  type TimelineVariant,
}
