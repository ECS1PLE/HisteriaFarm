import AppProvider from './providers/AppProvider'
import DashboardPage from './pages/DashboardPage'
import './App.css'
export default function App() {
  return (
    <AppProvider>
      <DashboardPage />
    </AppProvider>
  )
}
