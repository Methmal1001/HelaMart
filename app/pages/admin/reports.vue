<script setup lang="ts">
import type { ChatTurn, ReportCatalog, ReportName, ReportResult } from '~/services/admin/reportsApi'
import { askReports, downloadReportCsv, reportCatalog, runReport } from '~/services/admin/reportsApi'
import { branchDirectory } from '~/services/admin/orderingApi'
import { ApiError } from '~/services/apiError'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: { platform: 'platform.dashboard', tenant: 'orders.view' } })
useHead({ title: 'Reports assistant' })

interface Message extends ChatTurn {
  id: number
  reports?: ReportResult[]
  error?: boolean
  /** The user stopped this question (or it's the "stopped" notice); left out of the history sent next time. */
  stopped?: boolean
}

const auth = useAdminAuth()
const notify = useAdminNotify()
const catalog = ref<ReportCatalog | null>(null)
// Kept while moving around the admin panel; cleared on reload.
const messages = useState<Message[]>('reports-chat', () => [])
const draft = ref('')
const thinking = ref(false)
const downloading = ref<string | null>(null)
const thread = ref<HTMLElement | null>(null)

const today = new Date()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const quick = reactive({ from: iso(new Date(today.getTime() - 29 * 864e5)), to: iso(today), branchId: '' })
const branches = ref<{ id: string; name: string }[]>([])
/** Quick reports under their headings (Orders, Finance). */
const reportGroups = computed(() => {
  const groups = new Map<string, NonNullable<typeof catalog.value>['reports']>()
  for (const r of catalog.value?.reports ?? []) groups.set(r.group, [...(groups.get(r.group) ?? []), r])
  return [...groups].map(([name, reports]) => ({ name, reports }))
})
const quickArgs = () => ({ from: quick.from, to: quick.to, ...(quick.branchId ? { branchId: quick.branchId } : {}) })

const SUGGESTIONS = computed(() =>
  auth.isPlatform.value
    ? ['Which supermarkets earned the most revenue last month?', 'Compare commission per supermarket this quarter', 'Top 10 products across HelaMart this month', 'Orders by status in the last 7 days', 'Which supermarkets have overdue commission?']
    : ['How did each branch do last month?', 'What’s running low and how many days will it last?', 'Why were orders cancelled this month?', 'Which products make the most profit?', 'Which order-desk section is slowest?', 'What’s our profit and loss this month?'],
)

onMounted(async () => {
  try {
    catalog.value = await auth.call(reportCatalog)
    if (!auth.isPlatform.value) branches.value = await auth.call((t) => branchDirectory(t))
  } catch (e) {
    notify.error(e)
  }
})

let nextId = 1
/** The question being answered; aborting it stops the request and the server's remaining work. */
let running: AbortController | null = null

async function send(text = draft.value) {
  const question = text.trim()
  if (!question || thinking.value) return
  draft.value = ''
  const asked: Message = { id: nextId++, role: 'user', text: question }
  messages.value.push(asked)
  thinking.value = true
  const controller = (running = new AbortController())
  scrollDown()
  try {
    // Only plain text goes back as history (no failed or stopped turns); reports are re-run on the server when needed.
    const history = messages.value.filter((m) => !m.error && !m.stopped).map(({ role, text: t }) => ({ role, text: t })).slice(-20)
    const answer = await auth.call((t) => askReports(t, history, controller.signal))
    messages.value.push({ id: nextId++, role: 'assistant', text: answer.reply, reports: answer.reports })
  } catch (e) {
    if (controller.signal.aborted) {
      const m = messages.value.find((x) => x.id === asked.id)
      if (m) m.stopped = true
      messages.value.push({ id: nextId++, role: 'assistant', text: 'Stopped. Ask again whenever you’re ready.', stopped: true })
      if (!draft.value) draft.value = question
    } else {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
      messages.value.push({ id: nextId++, role: 'assistant', text: msg, error: true })
    }
  } finally {
    if (running === controller) running = null
    thinking.value = false
    scrollDown()
  }
}

/** Stop the question in progress. */
function stop() {
  running?.abort()
}

// Esc stops the answer from anywhere on the page (the question box is disabled while it runs).
const onEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && thinking.value) stop()
}
onMounted(() => window.addEventListener('keydown', onEsc))
// Leaving the page stops a question still running (no point paying for an answer nobody will see).
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEsc)
  stop()
})

function scrollDown() {
  void nextTick(() => thread.value?.scrollTo({ top: thread.value.scrollHeight, behavior: 'smooth' }))
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}

async function download(name: ReportName, args: Record<string, unknown>, key: string) {
  downloading.value = key
  try {
    await auth.call((t) => downloadReportCsv(t, name, args))
  } catch (e) {
    notify.error(e)
  } finally {
    downloading.value = null
  }
}

/** Show a report on the page straight away (no assistant needed). */
async function view(name: ReportName, title: string) {
  downloading.value = `view-${name}`
  try {
    const report = await auth.call((t) => runReport(t, name, quickArgs()))
    messages.value.push({ id: nextId++, role: 'assistant', text: title, reports: [report] })
    scrollDown()
  } catch (e) {
    notify.error(e)
  } finally {
    downloading.value = null
  }
}

function clearChat() {
  messages.value = []
}

// ------------------------------------------------------------------ display helpers

/** Tiny, safe Markdown subset for the assistant's replies: escapes HTML first, then bold, headings and lists. */
function render(md: string) {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code class="rounded bg-hela-green-50 px-1">$1</code>')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const close = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const raw of esc.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[*-]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line)
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) {
        close()
        out.push(kind === 'ul' ? '<ul class="my-1 list-disc space-y-0.5 pl-5">' : '<ol class="my-1 list-decimal space-y-0.5 pl-5">')
        list = kind
      }
      out.push(`<li>${inline((bullet ?? numbered)![1]!)}</li>`)
      continue
    }
    close()
    if (heading) out.push(`<p class="mt-2 font-extrabold text-ink">${inline(heading[1]!)}</p>`)
    else if (line.trim()) out.push(`<p class="my-1">${inline(line)}</p>`)
  }
  close()
  return out.join('')
}

function cell(col: string, v: string | number | null) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return /\(Rs\)/.test(col) ? v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString('en-LK')
  return v
}

const FILTER_LABELS: Record<string, string> = { from: 'From', to: 'To', branchId: 'Branch', supermarketId: 'Supermarket', statuses: 'Statuses', fulfilment: 'Fulfilment', paymentMethod: 'Payment', groupBy: 'Grouped by', sortBy: 'Sorted by', limit: 'Limit', category: 'Category', show: 'Showing', orderNumber: 'Order', customer: 'Customer', product: 'Product' }
function filterChips(f: Record<string, unknown>) {
  return Object.entries(f)
    .filter(([k]) => k !== 'note')
    .map(([k, v]) => `${FILTER_LABELS[k] ?? k}: ${k === 'branchId' ? (branches.value.find((b) => b.id === v)?.name ?? v) : Array.isArray(v) ? v.join(', ') : String(v)}`)
}

const expanded = ref<Record<string, boolean>>({})
const PREVIEW = 8
</script>

<template>
  <div>
    <AdminPageHeader
      title="Reports assistant"
      :description="auth.isPlatform.value ? 'Ask about orders, products, offers and order-desk work across every HelaMart supermarket. Answers come from live data; download any report as CSV.' : 'Ask about your orders, products, offers and order-desk work. Answers come from live data for the branches you can see; download any report as CSV.'"
    >
      <button v-if="messages.length" type="button" class="btn-ghost h-10" :disabled="thinking" @click="clearChat"><AppIcon name="refresh" :size="16" />New chat</button>
    </AdminPageHeader>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <!-- Chat -->
      <section class="card flex min-h-[32rem] flex-col p-0" aria-label="Reports assistant chat">
        <div ref="thread" class="flex-1 space-y-4 overflow-y-auto p-4" style="max-height: calc(100vh - 17rem)" aria-live="polite">
          <div v-if="!messages.length" class="mx-auto max-w-xl py-8 text-center">
            <div class="mx-auto grid size-12 place-items-center rounded-2xl bg-hela-green-50 text-hela-green"><AppIcon name="list" :size="22" /></div>
            <p class="mt-3 text-lg font-extrabold text-ink">What would you like to know?</p>
            <p class="mt-1 text-sm text-muted">Ask in plain words: periods like “last month” or “this week”, a branch, a status. Every answer shows the report it used.</p>
            <div v-if="catalog && !catalog.assistant" class="mt-4 rounded-xl bg-hela-gold-100 p-3 text-left text-sm text-[#6d5622]">
              The assistant isn’t set up on the server yet (Gemini API key missing). You can still view or download the reports on the right.
            </div>
            <div v-else class="mt-5 flex flex-wrap justify-center gap-2">
              <button v-for="s in SUGGESTIONS" :key="s" type="button" class="chip cursor-pointer hover:bg-hela-green-50" @click="send(s)">{{ s }}</button>
            </div>
          </div>

          <div v-for="m in messages" :key="m.id" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
            <div v-if="m.role === 'user'" class="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap" :class="m.stopped ? 'bg-hela-green/60 text-white' : 'bg-hela-green text-white'">{{ m.text }}</div>
            <div v-else class="w-full max-w-full space-y-3">
              <div class="max-w-[95%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm" :class="m.error ? 'bg-[#FBEAEA] text-[#8A2E2E]' : m.stopped ? 'bg-white text-muted ring-1 ring-line' : 'bg-hela-green-50/60 text-ink'">
                <div v-if="m.error" class="flex items-start gap-2"><AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />{{ m.text }}</div>
                <div v-else-if="m.stopped" class="flex items-center gap-2 italic"><AppIcon name="close" :size="14" class="shrink-0" />{{ m.text }}</div>
                <!-- eslint-disable-next-line vue/no-v-html -- render() escapes all HTML before adding formatting -->
                <div v-else v-html="render(m.text)" />
              </div>

              <article v-for="(r, i) in m.reports" :key="`${m.id}-${i}`" class="rounded-2xl ring-1 ring-line">
                <header class="flex flex-wrap items-start justify-between gap-2 border-b border-line p-3">
                  <div class="min-w-0">
                    <p class="font-extrabold text-ink">{{ r.title }}</p>
                    <p class="text-xs text-muted">{{ r.description }}</p>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      <span v-for="c in filterChips(r.filters)" :key="c" class="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-muted ring-1 ring-line">{{ c }}</span>
                    </div>
                    <p v-if="r.filters.note" class="mt-1 text-xs text-[#6d5622]">{{ r.filters.note }}</p>
                  </div>
                  <button type="button" class="btn-primary h-9 shrink-0 text-xs" :disabled="downloading === `${m.id}-${i}`" @click="download(r.name, r.args, `${m.id}-${i}`)">
                    <AppIcon name="copy" :size="14" />{{ downloading === `${m.id}-${i}` ? 'Preparing…' : 'Download CSV' }}
                  </button>
                </header>
                <div v-if="r.rows.length" class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-hela-green-50/50 text-muted">
                      <tr><th v-for="c in r.columns" :key="c" scope="col" class="px-3 py-2 font-bold whitespace-nowrap">{{ c }}</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, j) in expanded[`${m.id}-${i}`] ? r.rows : r.rows.slice(0, PREVIEW)" :key="j" class="border-t border-line" :class="row[0] === 'Total' ? 'font-bold' : ''">
                        <td v-for="(v, k) in row" :key="k" class="px-3 py-1.5 whitespace-nowrap" :class="typeof v === 'number' ? 'text-right tabular-nums' : ''">{{ cell(r.columns[k] ?? '', v) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-else class="p-3 text-sm text-muted">Nothing to show for this period.</p>
                <footer v-if="r.rows.length > PREVIEW || r.truncated" class="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-muted">
                  <button v-if="r.rows.length > PREVIEW" type="button" class="font-bold text-hela-green hover:underline" @click="expanded[`${m.id}-${i}`] = !expanded[`${m.id}-${i}`]">
                    {{ expanded[`${m.id}-${i}`] ? 'Show fewer rows' : `Show ${r.rows.length} rows` }}
                  </button>
                  <span v-if="r.truncated">Preview only — the CSV has every row.</span>
                </footer>
              </article>
            </div>
          </div>

          <div v-if="thinking" class="flex items-center gap-2 text-sm text-muted" role="status">
            <span class="inline-flex gap-1"><span class="size-1.5 animate-bounce rounded-full bg-hela-green" /><span class="size-1.5 animate-bounce rounded-full bg-hela-green [animation-delay:150ms]" /><span class="size-1.5 animate-bounce rounded-full bg-hela-green [animation-delay:300ms]" /></span>
            Running reports…
            <button type="button" class="ml-1 font-bold text-hela-green hover:underline" @click="stop">Stop</button>
          </div>
        </div>

        <form class="flex items-end gap-2 border-t border-line p-3" @submit.prevent="send()">
          <label for="report-question" class="sr-only">Ask about your orders</label>
          <textarea
            id="report-question"
            v-model="draft"
            rows="2"
            maxlength="1000"
            class="field min-h-11 flex-1 resize-none"
            :placeholder="catalog && !catalog.assistant ? 'The assistant isn’t available — use the quick reports on the right.' : 'e.g. What items are in order HM-2026-9087?'"
            :disabled="thinking || (catalog !== null && !catalog.assistant)"
            @keydown="onKey"
          />
          <button v-if="thinking" type="button" class="btn-ghost h-11" aria-label="Stop answering (Esc)" title="Stop (Esc)" @click="stop"><AppIcon name="close" :size="16" />Stop</button>
          <button v-else type="submit" class="btn-primary h-11" :disabled="!draft.trim() || (catalog !== null && !catalog.assistant)"><AppIcon name="arrow-right" :size="16" />Ask</button>
        </form>
      </section>

      <!-- Quick CSV downloads without the assistant -->
      <aside class="card h-fit p-4 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto" aria-label="Quick reports">
        <p class="font-extrabold text-ink">Quick reports</p>
        <p class="mt-0.5 text-xs text-muted">View or download straight away, no question needed.</p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <label class="text-xs"><span class="field-label">From</span><input v-model="quick.from" type="date" class="field" :max="quick.to"></label>
          <label class="text-xs"><span class="field-label">To</span><input v-model="quick.to" type="date" class="field" :min="quick.from"></label>
        </div>
        <label v-if="branches.length > 1" class="mt-2 block text-xs">
          <span class="field-label">Branch</span>
          <select v-model="quick.branchId" class="field" data-testid="quick-branch">
            <option value="">All branches</option>
            <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </label>
        <template v-for="g in reportGroups" :key="g.name">
        <h3 class="mt-4 text-xs font-extrabold tracking-wide text-muted uppercase">{{ g.name }}</h3>
        <ul class="mt-2 space-y-2">
          <li v-for="r in g.reports" :key="r.name" class="rounded-xl p-2 ring-1 ring-line">
            <span class="block text-sm font-bold text-ink">{{ r.title }}</span>
            <span class="line-clamp-2 text-[0.7rem] leading-snug text-muted" :title="r.description">{{ r.description }}</span>
            <span class="mt-2 flex gap-2">
              <button type="button" class="btn-ghost h-8 flex-1 text-xs" :disabled="downloading === `view-${r.name}`" :data-testid="`view-${r.name}`" @click="view(r.name, r.title)">
                {{ downloading === `view-${r.name}` ? 'Loading…' : 'View' }}
              </button>
              <button type="button" class="btn-ghost h-8 flex-1 text-xs" :disabled="downloading === `quick-${r.name}`" @click="download(r.name, quickArgs(), `quick-${r.name}`)">
                <AppIcon name="copy" :size="14" class="text-hela-green" />{{ downloading === `quick-${r.name}` ? 'Preparing…' : 'CSV' }}
              </button>
            </span>
          </li>
        </ul>
        </template>
        <p v-if="catalog && !catalog.showMoney" class="mt-3 text-xs text-[#6d5622]">Money columns are left out: you don’t have the “View revenue figures” permission.</p>
      </aside>
    </div>
  </div>
</template>
