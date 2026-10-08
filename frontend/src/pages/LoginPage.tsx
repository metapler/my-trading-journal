import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, LogIn, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/cn'
import { errCls, inputCls } from '../lib/formClasses'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Email is required.').email('Email must be valid.'),
  password: z.string().min(1, 'Password is required.').max(128),
})

const registerSchema = loginSchema
  .extend({
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters.')
      .max(128)
      .refine((s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s), {
        message: 'Password must include lowercase, uppercase, and a digit.',
      }),
    confirm: z.string().min(1, 'Confirm your password.'),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] })

type LoginValues = z.output<typeof loginSchema>
type LoginInput = z.input<typeof loginSchema>
type RegisterValues = z.output<typeof registerSchema>
type RegisterInput = z.input<typeof registerSchema>

function EmailField({ register, error }: { register: UseFormRegister<LoginInput>; error?: string }) {
  return (
    <div>
      <label htmlFor="auth-email" className="block text-xs text-[var(--text-secondary)]">
        Email
      </label>
      <input
        id="auth-email"
        type="email"
        autoComplete="username"
        placeholder="you@example.com"
        className={cn(inputCls, 'mt-1')}
        {...register('email')}
      />
      {error ? <p className={errCls}>{error}</p> : null}
    </div>
  )
}

function LoginFields({
  onSubmit,
}: {
  onSubmit: (email: string, password: string) => Promise<void>
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput, unknown, LoginValues>({ resolver: zodResolver(loginSchema) })

  async function submit(values: LoginValues) {
    setServerError(null)
    try {
      await onSubmit(values.email, values.password)
    } catch (e) {
      setServerError(e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : 'Sign in failed.')
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 space-y-3">
      <EmailField register={register} error={errors.email?.message} />
      <div>
        <label htmlFor="auth-password" className="block text-xs text-[var(--text-secondary)]">
          Password
        </label>
        <input
          id="auth-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className={cn(inputCls, 'mt-1')}
          {...register('password')}
        />
        {errors.password ? <p className={errCls}>{errors.password.message}</p> : null}
      </div>
      {serverError ? (
        <p role="alert" className="text-xs text-[var(--negative)]">
          {serverError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-[var(--radius-control)] bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
        {isSubmitting ? 'Please wait…' : 'Sign in'}
      </button>
    </form>
  )
}

function RegisterFields({
  onSubmit,
}: {
  onSubmit: (email: string, password: string) => Promise<void>
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, RegisterValues>({ resolver: zodResolver(registerSchema) })

  async function submit(values: RegisterValues) {
    setServerError(null)
    try {
      await onSubmit(values.email, values.password)
    } catch (e) {
      setServerError(e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : 'Registration failed.')
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 space-y-3">
      <EmailField register={register as unknown as UseFormRegister<LoginInput>} error={errors.email?.message} />
      <div>
        <label htmlFor="auth-new-password" className="block text-xs text-[var(--text-secondary)]">
          Password
        </label>
        <input
          id="auth-new-password"
          type="password"
          autoComplete="new-password"
          placeholder="Min 12 chars, mixed case + digit"
          className={cn(inputCls, 'mt-1')}
          {...register('password')}
        />
        {errors.password ? <p className={errCls}>{errors.password.message}</p> : null}
      </div>
      <div>
        <label htmlFor="auth-confirm" className="block text-xs text-[var(--text-secondary)]">
          Confirm password
        </label>
        <input
          id="auth-confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat password"
          className={cn(inputCls, 'mt-1')}
          {...register('confirm')}
        />
        {errors.confirm ? <p className={errCls}>{errors.confirm.message}</p> : null}
      </div>
      {serverError ? (
        <p role="alert" className="text-xs text-[var(--negative)]">
          {serverError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-[var(--radius-control)] bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
        {isSubmitting ? 'Please wait…' : 'Create account'}
      </button>
    </form>
  )
}

/** Login + register (PLAN §21). Session cookie is HTTP-only; nothing lands in localStorage. */
export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'register'>('login')

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function handleAuth(email: string, password: string) {
    if (mode === 'login') await login(email, password)
    else await register(email, password)
    navigate(from, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-sm flex-col justify-center">
      <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
          {mode === 'login' ? 'Welcome back' : 'Create your journal'}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {mode === 'login'
            ? 'Sign in to your private trading journal.'
            : 'One account, fully isolated data. 12+ characters with mixed case and a digit.'}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Auth mode">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                'min-h-11 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm transition-colors',
                mode === m
                  ? 'border-[var(--border-accent)] bg-[var(--surface-hover)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]',
              )}
            >
              {m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {mode === 'login' ? <LoginFields onSubmit={handleAuth} /> : <RegisterFields onSubmit={handleAuth} />}
      </div>
    </div>
  )
}
