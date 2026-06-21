import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const SCENARIO_COLORS = {
  'street-market':     '#f97316',
  'restaurant':        '#ef4444',
  'train-station':     '#3b82f6',
  'taxi-ride':         '#8b5cf6',
  'hotel-checkin':     '#06b6d4',
  'newspaper-reading': '#6366f1',
  'business-meeting':  '#facc15',
  'politician-speech': '#ec4899',
}
const DEFAULT_COLOR = '#58CC02'

export default function VocabularyWeb({ allVocabData, currentScenarioId, onClose }) {
  const svgRef = useRef(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el || !allVocabData?.length) return

    const width  = el.clientWidth
    const height = el.clientHeight

    // Build nodes from all vocab entries
    const nodes = []
    const linkMap = []
    let id = 0

    allVocabData.forEach(({ scenarioId, words, progress }) => {
      const color   = SCENARIO_COLORS[scenarioId] ?? DEFAULT_COLOR
      const groupStart = id
      words.forEach((word) => {
        nodes.push({
          id:        id++,
          en:        word.en,
          zh:        word.zh,
          pinyin:    word.pinyin,
          scenarioId,
          color,
          mastery:   Math.min(1, (progress ?? 0) / 100),
          isCurrent: scenarioId === currentScenarioId,
        })
      })
      // Fully connect words within the same scenario
      for (let a = groupStart; a < id; a++) {
        for (let b = a + 1; b < id; b++) {
          linkMap.push({ source: a, target: b, intraGroup: true })
        }
      }
    })

    const svg = d3.select(el)
    svg.selectAll('*').remove()

    // Glow filters
    const defs = svg.append('defs')
    ;[
      { id: 'glow',        blur: 4  },
      { id: 'strong-glow', blur: 10 },
    ].forEach(({ id: filterId, blur }) => {
      const f = defs.append('filter')
        .attr('id', filterId)
        .attr('x', '-60%').attr('y', '-60%')
        .attr('width', '220%').attr('height', '220%')
      f.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', blur).attr('result', 'b')
      const m = f.append('feMerge')
      m.append('feMergeNode').attr('in', 'b')
      m.append('feMergeNode').attr('in', 'SourceGraphic')
    })

    const g = svg.append('g')

    const simulation = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(linkMap).id(d => d.id).distance(90).strength(0.2))
      .force('charge',    d3.forceManyBody().strength(-280))
      .force('center',    d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => 26 + d.mastery * 18))

    // Links
    const linkSel = g.append('g').selectAll('line')
      .data(linkMap).enter().append('line')
      .attr('stroke', d => {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source
        return (nodes[srcId]?.color ?? DEFAULT_COLOR) + '35'
      })
      .attr('stroke-width', 1.2)
      .attr('opacity', 0)

    // Node groups
    const nodeSel = g.append('g').selectAll('g')
      .data(nodes).enter().append('g')
      .attr('opacity', 0)
      .attr('cursor', 'pointer')

    nodeSel.append('circle')
      .attr('r',            d => 22 + d.mastery * 16)
      .attr('fill',         'rgba(15,20,24,0.88)')
      .attr('stroke',       d => d.color)
      .attr('stroke-width', d => d.isCurrent ? 3 : 1.5)
      .attr('filter',       d => `url(#${d.isCurrent ? 'strong-glow' : 'glow'})`)

    nodeSel.append('text').text(d => d.zh)
      .attr('text-anchor', 'middle').attr('dy', '-0.35em')
      .attr('fill', 'white').attr('font-size', d => 11 + d.mastery * 5 + 'px').attr('font-weight', '700')
      .attr('pointer-events', 'none')

    nodeSel.append('text').text(d => d.en)
      .attr('text-anchor', 'middle').attr('dy', '1.1em')
      .attr('fill', d => d.color).attr('font-size', '9px').attr('font-weight', '600')
      .attr('pointer-events', 'none')

    // Hover
    nodeSel
      .on('mouseover', function (_, d) {
        d3.select(this).select('circle')
          .transition().duration(150)
          .attr('r', 30 + d.mastery * 16)
          .attr('stroke-width', 3)
      })
      .on('mouseout', function (_, d) {
        d3.select(this).select('circle')
          .transition().duration(150)
          .attr('r', 22 + d.mastery * 16)
          .attr('stroke-width', d.isCurrent ? 3 : 1.5)
      })

    simulation.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Staggered entry
    setTimeout(() => {
      linkSel.transition().duration(700).delay((_, i) => i * 15 + 300).attr('opacity', 1)
      nodeSel.transition().duration(500).delay((_, i) => i * 90 + 100).attr('opacity', 1)
    }, 80)

    return () => simulation.stop()
  }, [allVocabData, currentScenarioId])

  return (
    <div className="fixed inset-0 z-40 bg-[#05060a] animate-overlay-fade flex flex-col">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_rgba(88,204,2,0.04)_0%,_transparent_65%)]" />

      <header className="relative z-10 shrink-0 flex items-center justify-between px-8 py-5">
        <div>
          <p className="font-display text-[10px] font-extrabold uppercase tracking-[0.3em] text-gray-500 mb-0.5">
            Neural Vocabulary Web
          </p>
          <h2 className="font-display text-2xl font-extrabold text-white">Words Learned</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-7 py-2.5 rounded-2xl bg-[#58CC02] hover:bg-[#61D908] border-2 border-[#46A302] border-b-4 active:border-b-2 active:translate-y-0.5 transition-all text-white font-display font-extrabold uppercase tracking-wide"
        >
          Continue
        </button>
      </header>

      <svg ref={svgRef} className="flex-1 w-full" />

      <footer className="relative z-10 shrink-0 flex items-center justify-center gap-8 px-8 py-4">
        {[
          { color: '#58CC02', label: 'Mastered' },
          { color: '#facc15', label: 'Learning'  },
          { color: '#3b82f6', label: 'New'        },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-gray-500 font-bold">{label}</span>
          </div>
        ))}
        <span className="text-[11px] text-gray-600 font-bold">Node size = mastery level</span>
      </footer>
    </div>
  )
}
