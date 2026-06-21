// Icon wrapper — thin layer around lucide-react so the whole app pulls icons
// through one place with consistent defaults.

import {
  Home, LayoutDashboard, Waypoints, BookOpen, Flag, BarChart3,
  Archive, Music, MonitorPlay, CalendarClock, MessagesSquare, Settings,
  Wrench, Sparkles, Flame, Target, TrendingUp, TrendingDown, Check,
  X, Menu, ChevronRight, ChevronDown, ChevronUp, ChevronLeft, Plus, Trash2, Pencil,
  Mic, Send, Play, Pause, Volume2, RotateCcw, Search, Filter,
  Star, Heart, Clock, Zap, Brain, GraduationCap, ArrowRight, ArrowLeft,
  Copy, MoreHorizontal, MoreVertical, Eye, EyeOff, Loader2, AlertTriangle, Info,
  CircleCheck, Layers, Library, BookMarked, ListChecks,
  FileText, Camera, ImageIcon, ScanText,
  Folder, FolderOpen, FolderPlus, FilePlus, ChevronsUpDown, ListFilter,
  Shuffle, Repeat, SkipBack, SkipForward, Square,
  ZoomIn, ZoomOut, Maximize2, Minimize2, Split, Command, Scissors,
  SquareArrowOutUpRight,
} from 'lucide-react';

const DEFAULTS = { size: 18, strokeWidth: 1.75, absoluteStrokeWidth: false };

function make(LucideIcon) {
  return function WrappedIcon({ size, strokeWidth, ...rest }) {
    return (
      <LucideIcon
        size={size ?? DEFAULTS.size}
        strokeWidth={strokeWidth ?? DEFAULTS.strokeWidth}
        {...rest}
      />
    );
  };
}

function makeSpinner(LucideIcon) {
  return function WrappedSpinner({ size, strokeWidth, style, ...rest }) {
    return (
      <LucideIcon
        size={size ?? DEFAULTS.size}
        strokeWidth={strokeWidth ?? DEFAULTS.strokeWidth}
        style={{ animation: 'spin 1s linear infinite', ...style }}
        {...rest}
      />
    );
  };
}

export const Icon = {
  Home: make(Home),
  Dashboard: make(LayoutDashboard),
  Graph: make(Waypoints),
  Grammar: make(BookOpen),
  Flagged: make(Flag),
  Stats: make(BarChart3),
  Archive: make(Archive),
  Camera: make(Camera),
  Image: make(ImageIcon),
  Ocr: make(ScanText),
  Video: make(MonitorPlay),
  Music: make(Music),
  Youtube: make(MonitorPlay),
  Planner: make(CalendarClock),
  Conversation: make(MessagesSquare),
  Settings: make(Settings),
  Tools: make(Wrench),
  Library: make(Library),
  Spark: make(Sparkles),
  Streak: make(Flame),
  Target: make(Target),
  Up: make(TrendingUp),
  Down: make(TrendingDown),
  Star: make(Star),
  Heart: make(Heart),
  Clock: make(Clock),
  Zap: make(Zap),
  Brain: make(Brain),
  Grad: make(GraduationCap),
  Layers: make(Layers),
  Book: make(BookMarked),
  Tasks: make(ListChecks),
  FileText: make(FileText),
  Check: make(Check),
  CircleCheck: make(CircleCheck),
  Close: make(X),
  Menu: make(Menu),
  ChevronRight: make(ChevronRight),
  ChevronDown: make(ChevronDown),
  ChevronUp: make(ChevronUp),
  ChevronLeft: make(ChevronLeft),
  ChevronsUpDown: make(ChevronsUpDown),
  Plus: make(Plus),
  Trash: make(Trash2),
  Edit: make(Pencil),
  Pencil: make(Pencil),
  Open: make(SquareArrowOutUpRight),
  Mic: make(Mic),
  Send: make(Send),
  Play: make(Play),
  Pause: make(Pause),
  Stop: make(Square),
  Volume: make(Volume2),
  Shuffle: make(Shuffle),
  Repeat: make(Repeat),
  SkipBack: make(SkipBack),
  SkipForward: make(SkipForward),
  Reset: make(RotateCcw),
  Search: make(Search),
  Filter: make(Filter),
  ZoomIn: make(ZoomIn),
  ZoomOut: make(ZoomOut),
  Maximize: make(Maximize2),
  Minimize: make(Minimize2),
  ArrowRight: make(ArrowRight),
  ArrowLeft: make(ArrowLeft),
  Copy: make(Copy),
  Cut: make(Scissors),
  Command: make(Command),
  Split: make(Split),
  More: make(MoreHorizontal),
  MoreVertical: make(MoreVertical),
  Eye: make(Eye),
  EyeOff: make(EyeOff),
  Spinner: makeSpinner(Loader2),
  Warning: make(AlertTriangle),
  Info: make(Info),
  Folder: make(Folder),
  FolderOpen: make(FolderOpen),
  FolderPlus: make(FolderPlus),
  FilePlus: make(FilePlus),
  ListFilter: make(ListFilter),
};

export default Icon;
