import type { ReactNode } from "react";
import { CommandShell } from "./command-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <CommandShell>{children}</CommandShell>;
}
