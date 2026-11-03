/**
 * Board: MOTION, a micro-interactions kit in dots (#128). Eleven TILE cards, each one loop on the shared clock:
 * loaders (spinner, bounce, scan), progress (blocks, indeterminate, ring), a skeleton that resolves, toasts,
 * pull-to-refresh, a typing indicator and a send / sent / read sequence. A tap, a click or Enter replays a
 * card from the start; reduced motion shows each loop's settled state. Red is the board's one accent, one
 * live part per card. Pieces and the press / focus grammar come from the components board (`./motion-kit`).
 */
import { bounceCard, scanCard, spinnerCard } from './motion-loaders'
import { progressCard, ringCard, waitCard } from './motion-progress'
import { skeletonCard, toastCard } from './motion-feedback'
import { pullCard } from './motion-pull'
import { sendCard, typingCard } from './motion-chat'

export const motionBoard = [
  spinnerCard, bounceCard, scanCard,
  progressCard, waitCard, ringCard,
  skeletonCard, toastCard, pullCard,
  typingCard, sendCard,
]
