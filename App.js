import 'react-native-url-polyfill/auto'
import { StatusBar } from 'expo-status-bar'
import PratoProntoMobile from './expo-src/PratoProntoMobile'

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <PratoProntoMobile />
    </>
  )
}
