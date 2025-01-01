import { ToastActionElement, ToastProps } from "@/components/ui/toast";

export type Toast = {
  title?: string;
  description?: string;
  action?: ToastActionElement;
} & Partial<ToastProps>;