import Login from '../Login'

export default function AdminAuth({ onSuccess, onBack, initialError }) {
  return <Login adminOnly onAdminVerified={onSuccess} onBack={onBack} initialError={initialError} />
}
