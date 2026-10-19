import { use } from 'echarts/core'
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

// Nur die verwendeten Module registrieren (Tree-Shaking, Spezifikation Abschnitt 3).
use([
  BarChart,
  HeatmapChart,
  LineChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
  SVGRenderer,
])
