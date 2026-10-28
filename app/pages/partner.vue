<script setup lang="ts">
import type { TenantDocument, TenantStatus } from '~/types/admin'
import { DISTRICTS, isValidBrNumber, isValidNic } from '~/data/sriLanka'
import { applicationStatus, submitApplication, type ApplicationInput } from '~/services/partnerService'
import { ApiError } from '~/services/apiError'

useHead({ title: 'Sell on HelaMart — register your supermarket' })

const f = reactive({
  name: '', legalName: '', brNumber: '', vatNumber: '', ownerName: '', ownerNic: '', email: '', phone: '',
  hqAddress: '', district: '' as string, firstBranchName: '', firstBranchCity: '', expectedBranches: 1, declaration: false,
})
const docs = reactive<Record<TenantDocument['kind'], { fileName: string; sizeKb: number } | null>>({ br_certificate: null, owner_nic: null, address_proof: null })
const errors = reactive<Record<string, string>>({})
const busy = ref(false)
const serverError = ref('')
const reference = ref('')

const DOCS: { kind: TenantDocument['kind']; label: string; required: boolean }[] = [
  { kind: 'br_certificate', label: 'Business registration certificate', required: true },
  { kind: 'owner_nic', label: 'Owner’s NIC (both sides)', required: true },
  { kind: 'address_proof', label: 'Proof of business address (optional)', required: false },
]

/** Only the file name and size are kept — files never leave the browser in this prototype. */
function onFile(kind: TenantDocument['kind'], e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  delete errors[`doc_${kind}`]
  if (!file) return (docs[kind] = null)
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
    errors[`doc_${kind}`] = 'Use a PDF, JPG or PNG file.'
    ;(e.target as HTMLInputElement).value = ''
    return (docs[kind] = null)
  }
  if (file.size > 5 * 1024 * 1024) {
    errors[`doc_${kind}`] = 'Files must be 5 MB or smaller.'
    ;(e.target as HTMLInputElement).value = ''
    return (docs[kind] = null)
  }
  docs[kind] = { fileName: file.name, sizeKb: Math.ceil(file.size / 1024) }
}

function validate() {
  Object.keys(errors).forEach((k) => !k.startsWith('doc_') && delete errors[k])
  if (f.name.trim().length < 3) errors.name = 'Enter your supermarket’s name.'
  if (f.legalName.trim().length < 3) errors.legalName = 'Enter the registered business name.'
  if (!isValidBrNumber(f.brNumber)) errors.brNumber = 'e.g. PV 00123456'
  if (f.ownerName.trim().length < 3) errors.ownerName = 'Enter the owner’s full name.'
  if (!isValidNic(f.ownerNic)) errors.ownerNic = 'e.g. 199012345678 or 901234567V'
  if (!EMAIL_RE.test(f.email.trim())) errors.email = 'Enter a valid email address.'
  if (!isSriLankanMobile(f.phone)) errors.phone = 'e.g. 077 123 4567'
  if (f.hqAddress.trim().length < 8) errors.hqAddress = 'Enter the full head-office address.'
  if (!f.district) errors.district = 'Choose a district.'
  if (f.firstBranchName.trim().length < 2) errors.firstBranchName = 'Enter the branch name.'
  if (f.firstBranchCity.trim().length < 2) errors.firstBranchCity = 'Enter the town.'
  for (const d of DOCS) if (d.required && !docs[d.kind]) errors[`doc_${d.kind}`] = 'This document is required.'
  if (!f.declaration) errors.declaration = 'Please confirm the declaration.'
  return !Object.keys(errors).length
}

async function submit() {
  serverError.value = ''
  if (!validate()) {
    serverError.value = 'Please fix the highlighted fields.'
    return
  }
  busy.value = true
  try {
    const input: ApplicationInput = {
      ...f,
      expectedBranches: Number(f.expectedBranches),
      documents: DOCS.flatMap((d) => (docs[d.kind] ? [{ kind: d.kind, ...docs[d.kind]! }] : [])),
    }
    reference.value = (await submitApplication(input)).reference
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e) {
    serverError.value = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
  } finally {
    busy.value = false
  }
}

// ---- status lookup
const lookup = reactive({ reference: '', email: '' })
const lookupBusy = ref(false)
const lookupError = ref('')
const result = ref<Awaited<ReturnType<typeof applicationStatus>> | null>(null)
async function check() {
  lookupError.value = ''
  result.value = null
  lookupBusy.value = true
  try {
    result.value = await applicationStatus(lookup.reference, lookup.email)
  } catch (e) {
    lookupError.value = e instanceof ApiError ? e.message : 'Could not check the status.'
  } finally {
    lookupBusy.value = false
  }
}
const STATUS_TEXT: Record<TenantStatus, string> = {
  pending: 'Under review — HelaMart is verifying your documents.',
  active: 'Approved — your admin sign-in details have been sent to the owner’s email.',
  restricted: 'Approved, but currently restricted by HelaMart.',
  banned: 'This supermarket has been removed from HelaMart.',
  rejected: 'Not approved.',
}
const field = 'field h-11'
</script>

<template>
  <div class="min-h-dvh bg-warm-white">
    <SiteHeader />
    <main class="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <div class="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section>
          <p class="eyebrow">For supermarkets</p>
          <h1 class="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-hela-green sm:text-4xl">Bring your supermarket to HelaMart</h1>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Sell to shoppers across Sri Lanka in an immersive 3D store. Every supermarket is verified by HelaMart before going live.
            Once approved you get a secure admin portal to run your branches, officers, products, stock and orders.
          </p>

          <div v-if="reference" class="card mt-6 p-6" role="status">
            <div class="flex items-start gap-3">
              <span class="grid size-11 shrink-0 place-items-center rounded-full bg-hela-green text-hela-gold"><AppIcon name="check" :size="22" :stroke-width="3" /></span>
              <div>
                <h2 class="text-lg font-extrabold text-ink">Application received</h2>
                <p class="mt-1 text-sm text-muted">Your reference number is <b class="text-ink">{{ reference }}</b>. Keep it safe — you’ll need it with your email to check progress.</p>
                <p class="mt-2 text-sm text-muted">HelaMart reviews applications within 3 working days. When approved, the owner receives the admin sign-in details by email.</p>
              </div>
            </div>
          </div>

          <form v-else class="mt-6 space-y-6" novalidate @submit.prevent="submit">
            <fieldset class="card grid gap-3 p-5 sm:grid-cols-2">
              <legend class="px-1 text-sm font-bold text-ink">Business</legend>
              <label><span class="field-label">Supermarket name (shown to shoppers)</span><input v-model="f.name" :class="field" maxlength="60" :aria-invalid="!!errors.name"><span v-if="errors.name" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.name }}</span></label>
              <label><span class="field-label">Registered business name</span><input v-model="f.legalName" :class="field" maxlength="100" :aria-invalid="!!errors.legalName"><span v-if="errors.legalName" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.legalName }}</span></label>
              <label><span class="field-label">Business registration (BR) number</span><input v-model="f.brNumber" :class="field" placeholder="PV 00123456" :aria-invalid="!!errors.brNumber"><span v-if="errors.brNumber" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.brNumber }}</span></label>
              <label><span class="field-label">VAT number (optional)</span><input v-model="f.vatNumber" :class="field" maxlength="30"></label>
              <label class="sm:col-span-2"><span class="field-label">Head-office address</span><input v-model="f.hqAddress" :class="field" maxlength="200" :aria-invalid="!!errors.hqAddress"><span v-if="errors.hqAddress" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.hqAddress }}</span></label>
              <label><span class="field-label">District</span>
                <select v-model="f.district" :class="field" :aria-invalid="!!errors.district"><option value="" disabled>Choose…</option><option v-for="d in DISTRICTS" :key="d" :value="d">{{ d }}</option></select>
                <span v-if="errors.district" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.district }}</span>
              </label>
              <label><span class="field-label">Number of branches</span><input v-model.number="f.expectedBranches" type="number" min="1" max="500" :class="field"></label>
            </fieldset>

            <fieldset class="card grid gap-3 p-5 sm:grid-cols-2">
              <legend class="px-1 text-sm font-bold text-ink">Owner (becomes the chain admin)</legend>
              <label><span class="field-label">Full name</span><input v-model="f.ownerName" :class="field" maxlength="80" autocomplete="name" :aria-invalid="!!errors.ownerName"><span v-if="errors.ownerName" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.ownerName }}</span></label>
              <label><span class="field-label">NIC number</span><input v-model="f.ownerNic" :class="field" maxlength="12" :aria-invalid="!!errors.ownerNic"><span v-if="errors.ownerNic" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.ownerNic }}</span></label>
              <label><span class="field-label">Email</span><input v-model="f.email" type="email" :class="field" autocomplete="email" :aria-invalid="!!errors.email"><span v-if="errors.email" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.email }}</span></label>
              <label><span class="field-label">Mobile</span><input v-model="f.phone" type="tel" :class="field" autocomplete="tel" :aria-invalid="!!errors.phone"><span v-if="errors.phone" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.phone }}</span></label>
            </fieldset>

            <fieldset class="card grid gap-3 p-5 sm:grid-cols-2">
              <legend class="px-1 text-sm font-bold text-ink">First branch</legend>
              <label><span class="field-label">Branch name</span><input v-model="f.firstBranchName" :class="field" placeholder="e.g. Divulapitiya" :aria-invalid="!!errors.firstBranchName"><span v-if="errors.firstBranchName" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.firstBranchName }}</span></label>
              <label><span class="field-label">Town</span><input v-model="f.firstBranchCity" :class="field" :aria-invalid="!!errors.firstBranchCity"><span v-if="errors.firstBranchCity" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.firstBranchCity }}</span></label>
            </fieldset>

            <fieldset class="card space-y-3 p-5">
              <legend class="px-1 text-sm font-bold text-ink">Verification documents</legend>
              <p class="text-xs text-muted">PDF, JPG or PNG, up to 5 MB each.</p>
              <label v-for="d in DOCS" :key="d.kind" class="block">
                <span class="field-label">{{ d.label }}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" class="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-hela-green-50 file:px-3 file:py-2 file:font-semibold file:text-hela-green" @change="onFile(d.kind, $event)">
                <span v-if="docs[d.kind]" class="mt-1 block text-xs text-hela-green">✓ {{ docs[d.kind]!.fileName }} ({{ docs[d.kind]!.sizeKb }} KB)</span>
                <span v-if="errors[`doc_${d.kind}`]" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors[`doc_${d.kind}`] }}</span>
              </label>
            </fieldset>

            <label class="flex items-start gap-2.5 text-sm text-ink">
              <input v-model="f.declaration" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
              <span>I confirm the information is true and I’m authorised to register this business, and I agree to HelaMart’s partner terms.
                <span v-if="errors.declaration" class="block text-xs text-[#8A2E2E]">{{ errors.declaration }}</span>
              </span>
            </label>
            <p v-if="serverError" class="flex gap-2 rounded-xl bg-[#FBEAEA] px-3.5 py-2.5 text-sm text-[#8A2E2E]" role="alert"><AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />{{ serverError }}</p>
            <button type="submit" class="btn-primary h-12 px-6" :disabled="busy">{{ busy ? 'Submitting…' : 'Submit application' }}</button>
          </form>
        </section>

        <aside class="space-y-4">
          <section class="card p-5" aria-labelledby="status-h">
            <h2 id="status-h" class="font-bold text-ink">Check your application</h2>
            <form class="mt-3 space-y-2.5" @submit.prevent="check">
              <label class="block"><span class="field-label">Reference number</span><input v-model="lookup.reference" class="field" placeholder="HMA-2026-0004"></label>
              <label class="block"><span class="field-label">Owner email</span><input v-model="lookup.email" type="email" class="field"></label>
              <button type="submit" class="btn-ghost h-10 w-full" :disabled="lookupBusy || !lookup.reference || !lookup.email">{{ lookupBusy ? 'Checking…' : 'Check status' }}</button>
            </form>
            <p v-if="lookupError" class="mt-3 text-sm text-[#8A2E2E]" role="alert">{{ lookupError }}</p>
            <div v-if="result" class="mt-3 rounded-xl bg-white p-3 text-sm ring-1 ring-line" role="status">
              <p class="flex items-center justify-between gap-2"><b class="text-ink">{{ result.name }}</b><AdminBadge :value="result.status" /></p>
              <p class="mt-1 text-muted">{{ STATUS_TEXT[result.status] }}</p>
              <p v-if="result.reason" class="mt-1 text-xs text-[#8A2E2E]">Reason: {{ result.reason }}</p>
            </div>
          </section>
          <section class="card space-y-2 p-5 text-sm text-muted">
            <h2 class="font-bold text-ink">How it works</h2>
            <p><b class="text-ink">1.</b> Apply with your business documents.</p>
            <p><b class="text-ink">2.</b> HelaMart verifies your business registration and the owner’s identity.</p>
            <p><b class="text-ink">3.</b> Once approved, the owner signs in as Chain Admin, opens branches and adds officers.</p>
            <p><b class="text-ink">4.</b> Shoppers can choose your branches in the HelaMart 3D store.</p>
          </section>
        </aside>
      </div>
    </main>
  </div>
</template>
