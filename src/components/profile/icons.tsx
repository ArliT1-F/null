import {
  Code2,
  Disc3,
  Gamepad2,
  Github,
  Globe,
  Heart,
  Instagram,
  Linkedin,
  Link2,
  Mail,
  Music,
  ShoppingBag,
  Radio,
  Monitor,
  Twitch,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { LINK_ICONS } from "@/db/schema";

/**
 * Icon registry for link icons.
 *
 * The database stores a stable string key (LINK_ICONS); this module owns the
 * mapping to actual components. Nothing user-authored is ever imported
 * dynamically, so a link row cannot choose arbitrary code to render.
 */
const REGISTRY: Record<string, LucideIcon> = {
  LINK: Link2,
  GLOBE: Globe,
  GITHUB: Github,
  X: Twitter,
  INSTAGRAM: Instagram,
  YOUTUBE: Youtube,
  TWITCH: Twitch,
  DISCORD: Disc3,
  SPOTIFY: Radio,
  STEAM: Monitor,
  LINKEDIN: Linkedin,
  TIKTOK: Music,
  MAIL: Mail,
  MUSIC: Music,
  CODE: Code2,
  GAME: Gamepad2,
  SHOP: ShoppingBag,
  HEART: Heart,
};

export function linkIcon(key: string | null | undefined): LucideIcon {
  if (!key) return Link2;
  return REGISTRY[key] ?? Link2;
}

export function isKnownIcon(key: string): key is (typeof LINK_ICONS)[number] {
  return (LINK_ICONS as readonly string[]).includes(key);
}

export const ICON_CHOICES = LINK_ICONS;
