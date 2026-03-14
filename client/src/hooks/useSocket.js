import { useEffect, useRef } from 'react'
import { getSocket } from '../api'

export function useSocket(event, handler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const socket = getSocket()
    const fn = (...args) => handlerRef.current(...args)
    socket.on(event, fn)
    return () => socket.off(event, fn)
  }, [event])
}
