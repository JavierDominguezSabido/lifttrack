import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { EditSessionPage } from './pages/EditSessionPage'
import { HistoryPage } from './pages/HistoryPage'
import { RoutinePage } from './pages/RoutinePage'
import { WorkoutPage } from './pages/WorkoutPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/rutina" element={<RoutinePage />} />
        <Route path="/entrenamiento" element={<WorkoutPage />} />
        <Route path="/entrenamiento/:templateId" element={<WorkoutPage />} />
        <Route path="/historial" element={<HistoryPage />} />
        <Route path="/historial/sesion/:sessionId/editar" element={<EditSessionPage />} />
        <Route path="/historial/:exerciseId" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
