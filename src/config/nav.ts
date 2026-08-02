import {
  Home,
  Users,
  BriefcaseBusiness,
  ClipboardCheck,
  Palmtree,
  Clock,
  Banknote,
  HeartPulse,
  Target,
  MessageSquareHeart,
  BarChart3,
  FolderOpen,
  Inbox,
  Settings,
  CircleUserRound,
  GraduationCap,
  Award,
  type LucideIcon,
} from "lucide-react";
import type { SessionUser } from "@/lib/authz";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  show: (u: SessionUser) => boolean;
};

const everyone = () => true;
const managersUp = (u: SessionUser) => u.role === "ADMIN" || u.isManager;
const adminOnly = (u: SessionUser) => u.role === "ADMIN";

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home", icon: Home, show: everyone },
  { label: "My Info", href: "/my-info", icon: CircleUserRound, show: everyone },
  { label: "People", href: "/people", icon: Users, show: everyone },
  { label: "Hiring", href: "/hiring", icon: BriefcaseBusiness, show: adminOnly },
  { label: "Onboarding", href: "/onboarding", icon: ClipboardCheck, show: adminOnly },
  { label: "Time Off", href: "/time-off", icon: Palmtree, show: everyone },
  { label: "Timesheets", href: "/timesheets", icon: Clock, show: everyone },
  { label: "Payroll", href: "/payroll", icon: Banknote, show: adminOnly },
  { label: "Benefits", href: "/benefits", icon: HeartPulse, show: everyone },
  { label: "Performance", href: "/performance", icon: Target, show: everyone },
  { label: "Training", href: "/training", icon: GraduationCap, show: everyone },
  { label: "Recognition", href: "/recognition", icon: Award, show: everyone },
  { label: "Surveys", href: "/surveys", icon: MessageSquareHeart, show: everyone },
  { label: "Reports", href: "/reports", icon: BarChart3, show: managersUp },
  { label: "Files", href: "/files", icon: FolderOpen, show: everyone },
  { label: "Inbox", href: "/inbox", icon: Inbox, show: everyone },
  { label: "Settings", href: "/settings", icon: Settings, show: adminOnly },
];
