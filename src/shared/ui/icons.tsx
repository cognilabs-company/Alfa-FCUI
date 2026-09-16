// @ts-nocheck
import React from 'react';
import {
  SquaresFour, UsersThree, UsersFour, User, UserPlus, UserGear, UserCheck, UserMinus, Student,
  CalendarDots, CalendarCheck, CalendarPlus, Trophy, FileText, DoorOpen, Wallet, GearSix,
  ShieldCheck, ShieldSlash, MagnifyingGlass, Bell, CaretDown, CaretRight, CaretLeft, Plus, Funnel,
  DownloadSimple, UploadSimple, DotsThree, PencilSimple, Trash, Check, X, Eye, EyeSlash, Sun, Moon,
  Phone, EnvelopeSimple, MapPin, Clock, Pulse, SignOut, SignIn, Star, LockKey, List, TrendUp, TrendDown,
  Warning, WarningCircle, ArrowsClockwise, CreditCard, Link, Coins, ArrowLeft, ArrowRight,
  ArrowUpRight, Camera, File, FloppyDisk, XCircle, CheckCircle, Palette, Archive, SoccerBall,
  ChartLineUp, ChartBar, Queue, Hourglass, PauseCircle, Prohibit, Lightning, CircleDashed,
  SealCheck, Receipt, HandCoins, Money, Timer, Target, Sparkle, Info, IdentificationCard,
  ListChecks, Rows, GridFour, MinusCircle, PlusCircle, NotePencil, Medal, Flag, Question, Key,
  Scroll, ClipboardText, Stack, CurrencyCircleDollar, ChalkboardTeacher, Gavel, Handshake, Wrench,
  GlobeHemisphereEast, Drop, Ruler,
} from '@phosphor-icons/react';

/*
 * Premium icon set (Phosphor). Keeps the original `Icon.Name` API so every
 * page picks the new glyphs up automatically.
 *
 * Weight is chosen by size unless passed explicitly:
 *   ≥16px → duotone (two-tone, premium look), <16px → bold (crisp at small sizes).
 * `strokeWidth >= 2.2` (legacy prop) forces bold.
 */
function make(Glyph, fixedWeight) {
  function PhIcon({ size = 18, color = 'currentColor', weight, strokeWidth, style, className, title }) {
    const w = weight || fixedWeight || (strokeWidth >= 2.2 ? 'bold' : size >= 16 ? 'duotone' : 'bold');
    return (
      <Glyph
        size={size}
        color={color}
        weight={w}
        className={className}
        style={{ flexShrink: 0, ...style }}
        aria-hidden={title ? undefined : true}
        alt={title}
      />
    );
  }
  return PhIcon;
}

export const Icon = {
  // Navigation / entities
  Dashboard: make(SquaresFour),
  Users: make(UsersThree),
  UsersFour: make(UsersFour),
  User: make(User),
  UserPlus: make(UserPlus),
  UserGear: make(UserGear),
  UserCheck: make(UserCheck),
  UserMinus: make(UserMinus),
  Student: make(Student),
  Coach: make(ChalkboardTeacher),
  Group: make(UsersFour),
  Whistle: make(SoccerBall),
  Ball: make(SoccerBall),
  Calendar: make(CalendarDots),
  CalendarCheck: make(CalendarCheck),
  CalendarPlus: make(CalendarPlus),
  Trophy: make(Trophy),
  Medal: make(Medal),
  FileText: make(FileText),
  Scroll: make(Scroll),
  Gate: make(DoorOpen),
  Wallet: make(Wallet),
  Settings: make(GearSix),
  Shield: make(ShieldCheck),
  ShieldOff: make(ShieldSlash),
  Queue: make(Queue),
  Reports: make(ChartLineUp),
  ChartBar: make(ChartBar),
  Clipboard: make(ClipboardText),
  Handshake: make(Handshake),
  Gavel: make(Gavel),

  // Actions
  Search: make(MagnifyingGlass),
  Bell: make(Bell),
  Plus: make(Plus),
  PlusCircle: make(PlusCircle),
  MinusCircle: make(MinusCircle),
  Filter: make(Funnel),
  Download: make(DownloadSimple),
  Upload: make(UploadSimple),
  More: make(DotsThree, 'bold'),
  Edit: make(PencilSimple),
  Note: make(NotePencil),
  Trash: make(Trash),
  Trash2: make(Trash),
  Check: make(Check, 'bold'),
  X: make(X, 'bold'),
  Eye: make(Eye),
  EyeOff: make(EyeSlash),
  Save: make(FloppyDisk),
  RefreshCw: make(ArrowsClockwise),
  Link: make(Link),
  Logout: make(SignOut),
  LogOut: make(SignOut),
  Login: make(SignIn),
  LogIn: make(SignIn),
  Lock: make(LockKey),
  Key: make(Key),
  Menu: make(List, 'bold'),
  Palette: make(Palette),
  Archive: make(Archive),
  Stack: make(Stack),
  Rows: make(Rows),
  Grid: make(GridFour),
  ListChecks: make(ListChecks),

  // Arrows
  ChevronDown: make(CaretDown, 'bold'),
  ChevronRight: make(CaretRight, 'bold'),
  ChevronLeft: make(CaretLeft, 'bold'),
  ArrowLeft: make(ArrowLeft, 'bold'),
  ArrowRight: make(ArrowRight, 'bold'),
  ArrowUpRight: make(ArrowUpRight, 'bold'),

  // Contact / misc
  Sun: make(Sun),
  Moon: make(Moon),
  Phone: make(Phone),
  Mail: make(EnvelopeSimple),
  MapPin: make(MapPin),
  Clock: make(Clock),
  Timer: make(Timer),
  Activity: make(Pulse),
  Star: make(Star),
  Camera: make(Camera),
  File: make(File),
  IdCard: make(IdentificationCard),
  Globe: make(GlobeHemisphereEast),
  Drop: make(Drop),
  Ruler: make(Ruler),
  Target: make(Target),
  Sparkle: make(Sparkle),
  Info: make(Info),
  Question: make(Question),
  Flag: make(Flag),
  Wrench: make(Wrench),

  // Money
  CreditCard: make(CreditCard),
  Coins: make(Coins),
  Money: make(Money),
  HandCoins: make(HandCoins),
  Receipt: make(Receipt),
  Currency: make(CurrencyCircleDollar),
  TrendUp: make(TrendUp),
  TrendDown: make(TrendDown),
  TrendingUp: make(TrendUp),

  // Status
  AlertTriangle: make(Warning),
  AlertCircle: make(WarningCircle),
  XCircle: make(XCircle),
  CheckCircle: make(CheckCircle),
  Hourglass: make(Hourglass),
  Pause: make(PauseCircle),
  Prohibit: make(Prohibit),
  Lightning: make(Lightning),
  Dashed: make(CircleDashed),
  Sealed: make(SealCheck),
};
