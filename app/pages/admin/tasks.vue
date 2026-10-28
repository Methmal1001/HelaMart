<script setup lang="ts">
import type { StaffTask, TaskStatus } from '~/types/admin'
import { commentOnTask, deleteTask, listTasks, saveTask, setTaskStatus, staffDirectory, type TaskInput } from '~/services/admin/api'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: 'tasks.view' })
useHead({ title: 'Tasks' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const tasks = ref<StaffTask[]>([])
const scope = ref<'all' | 'mine'>('mine')
const people = ref<{ id: string; name: string; title: string; avatarColor: string; status: string }[]>([])
const who = ref<string>('everyone')
const canManage = computed(() => auth.can('tasks.manage'))

async function load() {
  try {
    const r = await auth.call(listTasks)
    tasks.value = r.tasks
    scope.value = r.scope
    people.value = await auth.call(staffDirectory)
  } catch (e) {
    notify.error(e)
  }
}
onMounted(load)

const person = (id: string) => people.value.find((p) => p.id === id)
const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
]
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }
const visible = computed(() =>
  tasks.value
    .filter((t) => who.value === 'everyone' || (who.value === 'me' ? t.assigneeId === auth.user.value?.id : t.assigneeId === who.value))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.dueDate.localeCompare(b.dueDate)),
)
const today = new Date().toISOString().slice(0, 10)
const overdue = (t: StaffTask) => t.status !== 'done' && t.dueDate < today

// ---- detail
const open = ref<StaffTask | null>(null)
const comment = ref('')
const canUpdate = (t: StaffTask) => canManage.value || t.assigneeId === auth.user.value?.id

async function move(t: StaffTask, status: TaskStatus) {
  try {
    const u = await auth.call((tok) => setTaskStatus(tok, t.id, status))
    tasks.value = tasks.value.map((x) => (x.id === u.id ? u : x))
    if (open.value?.id === u.id) open.value = u
  } catch (e) {
    notify.error(e)
  }
}

async function addComment() {
  if (!open.value || !comment.value.trim()) return
  const id = open.value.id
  try {
    const u = await auth.call((t) => commentOnTask(t, id, comment.value))
    tasks.value = tasks.value.map((x) => (x.id === u.id ? u : x))
    open.value = u
    comment.value = ''
  } catch (e) {
    notify.error(e)
  }
}

async function remove(t: StaffTask) {
  const r = await confirm({ title: 'Delete this task?', message: `“${t.title}” will be removed for everyone.`, confirmLabel: 'Delete task', tone: 'danger' })
  if (!r.ok) return
  try {
    await auth.call((tok) => deleteTask(tok, t.id))
    tasks.value = tasks.value.filter((x) => x.id !== t.id)
    open.value = null
    notify.ok('Task deleted')
  } catch (e) {
    notify.error(e)
  }
}

// ---- editor
const editing = ref<StaffTask | 'new' | null>(null)
const f = reactive<TaskInput>({ title: '', description: '', assigneeId: '', priority: 'medium', dueDate: today })
const error = ref('')
function edit(t: StaffTask | 'new') {
  editing.value = t
  error.value = ''
  Object.assign(f, t === 'new' ? { title: '', description: '', assigneeId: people.value.find((p) => p.status === 'active' && p.id !== auth.user.value?.id)?.id ?? '', priority: 'medium', dueDate: today } : { ...t })
  open.value = null
}
async function save() {
  const id = editing.value === 'new' ? undefined : editing.value?.id
  try {
    const t = await auth.call((tok) => saveTask(tok, { ...f }, id))
    tasks.value = id ? tasks.value.map((x) => (x.id === t.id ? t : x)) : [t, ...tasks.value]
    notify.ok(id ? 'Task updated' : `Task assigned to ${person(t.assigneeId)?.name}`)
    editing.value = null
  } catch (e) {
    error.value = (e as Error).message
  }
}
const when = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div>
    <AdminPageHeader title="Tasks" :description="scope === 'all' ? 'Assign work to your team and follow it through.' : 'Tasks assigned to you.'">
      <select v-if="scope === 'all'" v-model="who" class="field h-10 w-auto" aria-label="Show tasks for">
        <option value="everyone">Everyone</option>
        <option value="me">Assigned to me</option>
        <option v-for="p in people.filter((x) => x.status === 'active')" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <button v-if="canManage" type="button" class="btn-primary h-10" @click="edit('new')"><AppIcon name="plus" :size="17" />New task</button>
    </AdminPageHeader>

    <div class="grid gap-4 lg:grid-cols-3">
      <section v-for="col in COLUMNS" :key="col.id" class="rounded-2xl bg-white/60 p-3 ring-1 ring-line" :aria-label="col.label">
        <h2 class="mb-3 flex items-center justify-between px-1 text-sm font-bold text-ink">
          {{ col.label }}
          <span class="rounded-full bg-cream px-2 text-xs text-muted">{{ visible.filter((t) => t.status === col.id).length }}</span>
        </h2>
        <ul class="space-y-2">
          <li v-for="t in visible.filter((x) => x.status === col.id)" :key="t.id">
            <button type="button" class="card block w-full p-3 text-left transition hover:shadow-card" @click="open = t">
              <span class="flex items-start justify-between gap-2">
                <span class="text-sm font-semibold text-ink">{{ t.title }}</span>
                <AdminBadge :value="t.priority" />
              </span>
              <span class="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                <span class="flex items-center gap-1.5">
                  <UserAvatar v-if="person(t.assigneeId)" :name="person(t.assigneeId)!.name" :color="person(t.assigneeId)!.avatarColor" :size="20" />
                  {{ person(t.assigneeId)?.name ?? 'Unassigned' }}
                </span>
                <span :class="overdue(t) ? 'font-bold text-[#8A2E2E]' : ''">{{ overdue(t) ? 'Overdue · ' : 'Due ' }}{{ t.dueDate }}</span>
              </span>
              <span v-if="t.comments.length" class="mt-1 block text-xs text-muted">{{ t.comments.length }} comment{{ t.comments.length === 1 ? '' : 's' }}</span>
            </button>
          </li>
          <li v-if="!visible.some((x) => x.status === col.id)" class="px-1 py-6 text-center text-xs text-muted">Nothing here.</li>
        </ul>
      </section>
    </div>

    <AdminModal :open="!!open" :title="open?.title ?? ''" size="lg" @close="open = null">
      <div v-if="open" class="space-y-4 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <AdminBadge :value="open.priority" :label="`${open.priority} priority`" />
          <span class="text-muted">Assigned to <b class="text-ink">{{ person(open.assigneeId)?.name }}</b> by {{ person(open.createdById)?.name ?? '—' }}</span>
          <span :class="overdue(open) ? 'font-bold text-[#8A2E2E]' : 'text-muted'">· Due {{ open.dueDate }}</span>
        </div>
        <p class="whitespace-pre-line text-ink">{{ open.description || 'No description.' }}</p>
        <div v-if="canUpdate(open)" class="flex flex-wrap gap-2" role="group" aria-label="Status">
          <button v-for="c in COLUMNS" :key="c.id" type="button" class="btn h-8 px-3 text-xs ring-1" :class="open.status === c.id ? 'bg-hela-green text-white ring-hela-green' : 'bg-white ring-line'" :aria-pressed="open.status === c.id" @click="move(open, c.id)">{{ c.label }}</button>
        </div>
        <section>
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Comments</h3>
          <ul class="space-y-2">
            <li v-for="(c, i) in open.comments" :key="i" class="rounded-lg bg-white p-2.5 ring-1 ring-line">
              <p class="text-xs text-muted"><b class="text-ink">{{ person(c.byId)?.name }}</b> · {{ when(c.at) }}</p>
              <p class="mt-0.5 whitespace-pre-line text-ink">{{ c.text }}</p>
            </li>
          </ul>
          <form v-if="canUpdate(open)" class="mt-2 flex gap-2" @submit.prevent="addComment">
            <input v-model="comment" class="field" maxlength="500" placeholder="Add an update…" aria-label="Comment">
            <button type="submit" class="btn-primary h-10" :disabled="!comment.trim()">Post</button>
          </form>
        </section>
      </div>
      <template v-if="open && canManage" #footer>
        <button type="button" class="btn-ghost h-9 text-[#8A2E2E]" @click="remove(open)"><AppIcon name="trash" :size="15" />Delete</button>
        <button type="button" class="btn-ghost h-9" @click="edit(open)"><AppIcon name="edit" :size="15" />Edit</button>
      </template>
    </AdminModal>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'New task' : 'Edit task'" @close="editing = null">
      <form id="task-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
        <label class="sm:col-span-2"><span class="field-label">Title</span><input v-model="f.title" class="field" maxlength="100" data-autofocus></label>
        <label class="sm:col-span-2"><span class="field-label">Details</span><textarea v-model="f.description" rows="3" maxlength="1000" class="field h-auto py-2" /></label>
        <label class="sm:col-span-2"><span class="field-label">Assign to</span>
          <select v-model="f.assigneeId" class="field">
            <option v-for="p in people.filter((x) => x.status === 'active')" :key="p.id" :value="p.id">{{ p.name }} — {{ p.title }}</option>
          </select>
        </label>
        <label><span class="field-label">Priority</span>
          <select v-model="f.priority" class="field"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
        </label>
        <label><span class="field-label">Due date</span><input v-model="f.dueDate" type="date" class="field"></label>
        <p v-if="error" class="text-sm text-[#8A2E2E] sm:col-span-2" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="task-form" class="btn-primary h-9">Save task</button>
      </template>
    </AdminModal>
  </div>
</template>
