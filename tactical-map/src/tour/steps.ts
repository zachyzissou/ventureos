/**
 * Tour Step Definitions — Issue #210
 */

import type { TourStep, HelpOverlayEntry } from './types';

export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome, Executor',
    body: 'This is the Tactical Map — your command center for the VentureOS agent swarm. Let\'s take a quick tour.',
    anchor: 'viewport',
  },
  {
    id: 'nexus',
    title: 'The Nexus Core',
    body: 'The golden structure at the center is Nexus, the orchestrator. It routes tasks, resolves conflicts, and keeps the swarm coherent.',
    anchor: 'nexus',
    spotlightRadius: 120,
  },
  {
    id: 'agents',
    title: 'Agent Buildings',
    body: 'Each building around the ring represents a specialist agent — Oracle, Atlas, Sentinel, and more. Click one to view its detail panel.',
    anchor: 'agent:oracle',
    spotlightRadius: 100,
    advanceOn: { type: 'event', eventType: 'agent:click' },
  },
  {
    id: 'khala',
    title: 'Khala Network',
    body: 'The glowing lines between agents visualize their collaboration bonds. Brighter, thicker lines mean stronger real-time cooperation.',
    anchor: 'agent:sentinel',
    spotlightRadius: 180,
  },
  {
    id: 'hud',
    title: 'HUD & KPI Ticker',
    body: 'The top bar shows navigation tabs and a scrolling KPI ticker with live agent stats.',
    anchor: 'hud',
  },
  {
    id: 'palette',
    title: 'Command Palette',
    body: 'Press ⌘K to open the command palette. From there you can inspect agents, spawn missions, adjust budgets, and undo actions.',
    anchor: 'viewport',
    advanceOn: { type: 'event', eventType: 'palette:open' },
  },
  {
    id: 'complete',
    title: 'You\'re Ready!',
    body: 'Press ? at any time to see keyboard shortcuts. Explore the map — click agents, zoom with scroll, and pan by dragging the terrain.',
    anchor: 'viewport',
  },
];

export const HELP_ENTRIES: HelpOverlayEntry[] = [
  { id: 'pan', shortcut: 'Drag', description: 'Pan the map', category: 'navigation' },
  { id: 'zoom', shortcut: 'Scroll / +/−', description: 'Zoom in/out', category: 'navigation' },
  { id: 'reset', shortcut: 'Double-click', description: 'Reset camera', category: 'navigation' },
  { id: 'arrows', shortcut: '↑↓←→', description: 'Pan with keyboard', category: 'navigation' },
  { id: 'cmd-k', shortcut: '⌘K', description: 'Command palette', category: 'controls' },
  { id: 'cmd-m', shortcut: '⌘M', description: 'Spawn mission', category: 'controls' },
  { id: 'cmd-e', shortcut: '⌘E', description: 'Edit missions', category: 'controls' },
  { id: 'cmd-z', shortcut: '⌘Z', description: 'Undo', category: 'controls' },
  { id: 'cmd-sz', shortcut: '⌘⇧Z', description: 'Redo', category: 'controls' },
  { id: 'esc', shortcut: 'Esc', description: 'Close panel / modal', category: 'controls' },
  { id: 'help', shortcut: '?', description: 'Toggle help overlay', category: 'views' },
  { id: 'tour', shortcut: '⌘/', description: 'Restart onboarding tour', category: 'views' },
];
