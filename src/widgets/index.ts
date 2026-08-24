import type { WidgetPreset } from './types'
import { clock } from './clock'
import { timer } from './timer'
import { boardingPass } from './boardingPass'
import { headlineText } from './headlineText'
import { gaugeSpeed } from './gaugeSpeed'
import { gaugeBattery } from './gaugeBattery'
import { fitnessRings } from './fitnessRings'
import { oxygenRing } from './oxygenRing'
import { moistureLeafRings } from './moistureLeafRings'
import { dialRadio } from './dialRadio'
import { breathingCircles } from './breathingCircles'
import { deviceOverviewDonut } from './deviceOverviewDonut'
import { agentAvatarRing } from './agentAvatarRing'
import { weatherCard } from './weatherCard'
import { settingsList } from './settingsList'
import { evCharge } from './evCharge'
import { visionCube } from './visionCube'
import { appIconGrid } from './appIconGrid'
import { thermalMonitor } from './thermalMonitor'
import { portraitArt } from './portraitArt'
import { albumArt } from './albumArt'
import { silhouetteArt } from './silhouetteArt'
import { musicPlayer, ecgMonitor } from './ecgMonitor'
import { audioRecorder } from './audioRecorder'
import { voiceListening } from './voiceListening'
import { interpreterDual } from './interpreterDual'
import { lapTimeChart } from './lapTimeChart'
import { retailAnalytics } from './retailAnalytics'
import { sleepChart } from './sleepChart'
import { systemStatsBars } from './systemStatsBars'
import { metroLine } from './metroLine'
import { starFieldWidget } from './starField'
import { passwordDotsRing } from './passwordDotsRing'
import { mazeGame } from './mazeGame'
import { messagesList } from './messagesList'
import { aiAssistantChat } from './aiAssistantChat'
import { cameraViewfinder } from './cameraViewfinder'
import { shoppingChecklist } from './shoppingChecklist'
import { agentStatus } from './agentStatus'
import { sunburstWidget } from './sunburstWidget'
import { pharmaTrack } from './pharmaTrack'
import { codexUsage } from './codexUsage'
import { homeQuiet } from './homeQuiet'
import { wikiGraph } from './wikiGraph'
import { notificationsGrid } from './notificationsGrid'
import { rideDual } from './rideDual'
import { recorder } from './recorder'

export const widgetPresets: WidgetPreset[] = [
  recorder, clock, timer, boardingPass, headlineText,
  gaugeSpeed, gaugeBattery, fitnessRings, oxygenRing, moistureLeafRings, dialRadio, breathingCircles, deviceOverviewDonut, agentAvatarRing, sunburstWidget, rideDual,
  weatherCard, settingsList, evCharge, visionCube, appIconGrid, wikiGraph, notificationsGrid,
  thermalMonitor, portraitArt, albumArt, silhouetteArt,
  musicPlayer, audioRecorder, voiceListening, interpreterDual, ecgMonitor, lapTimeChart, retailAnalytics, sleepChart, systemStatsBars, metroLine, codexUsage,
  starFieldWidget, passwordDotsRing, mazeGame,
  messagesList, aiAssistantChat, cameraViewfinder, shoppingChecklist, agentStatus, pharmaTrack, homeQuiet,
]

export const widgetById = (id: string): WidgetPreset | undefined => widgetPresets.find(p => p.id === id)

export * from './types'
