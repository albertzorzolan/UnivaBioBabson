// Kinwise design system — import everything UI from "src/ui" (e.g. `import { Button, Card } from "../../ui"`).
// Styles: tokens.css → base.css → components.css are loaded once in main.tsx.

export { cx } from "./cx";
export { contrastRatio, relativeLuminance, hexToRgb, AA_TEXT, AA_LARGE_OR_UI } from "./contrast";
export { useFocusTrap, useReturnFocus, useMediaQuery, useEscape, focusableIn } from "./hooks";
export { ICONS, Logo, LogoMark, type IconName } from "./icons";

export { Button, ButtonLink, IconButton, Spinner, type ButtonProps, type ButtonLinkProps, type IconButtonProps, type ButtonVariant, type ButtonSize } from "./components/Button";
export { Card, CardHeader, CardBody, CardFooter, type CardProps, type CardHeaderProps, type CardTone } from "./components/Card";
export { Badge, Chip, toneIcon, type BadgeProps, type ChipProps, type Tone } from "./components/Badge";
export { Stat, Meter, ProgressBar, bandFor, ACB_BANDS, ACB_THRESHOLD_NOTE, type StatProps, type MeterProps, type MeterBand, type ProgressBarProps } from "./components/Stat";
export { Field, TextInput, TextArea, Select, type FieldProps, type FieldIds, type TextInputProps, type TextAreaProps, type SelectProps } from "./components/Field";
export { Segmented, type SegmentedProps, type SegmentedOption } from "./components/Segmented";
export { Modal, Drawer, type ModalProps, type DrawerProps } from "./components/Dialog";
export { Tabs, TabPanel, type TabsProps, type TabPanelProps, type TabItem } from "./components/Tabs";
export { ToastProvider, useToast, type ToastOptions } from "./components/Toast";
export { PageHeader, Callout, EmptyState, Skeleton, Disclosure, Tooltip, Avatar, type PageHeaderProps, type CalloutProps, type EmptyStateProps, type SkeletonProps, type DisclosureProps, type TooltipProps } from "./components/Display";
export { SourceCitation, EvidenceLink, AIBadge, formatDuration, type CitationSource, type SourceCitationProps, type EvidenceLinkProps, type AIBadgeProps } from "./components/Evidence";
export { TimelineDot, TimelineLegend, MedEventMarker, SERIES_VAR, SERIES_SHAPE, readToken, type MarkerShape, type LegendItem, type TimelineDotProps } from "./components/TimelineKit";
export { DemoDataChip } from "./components/Demo";
