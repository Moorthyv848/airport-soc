import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

export function useCameras(seed) {
  const [cameras, setCameras] = useState(seed);

  useEffect(() => {
    const unsub = onSnapshot(collection(db,"cameras"), snap=>{
      const rows = [];
      snap.forEach(d=>rows.push({ id:d.id, ...d.data() }));
      if(rows.length) setCameras(rows);
    });

    return ()=>unsub();
  }, []);

  return { cameras, setCameras };
}
