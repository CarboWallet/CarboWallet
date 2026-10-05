import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc,
    getDocs, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAAQ4f1wD8W3WOoZANRO5KvOJW2gfP_wwE",
    authDomain: "bancomovil-421ff.firebaseapp.com",
    projectId: "bancomovil-421ff",
    storageBucket: "bancomovil-421ff.firebasestorage.app",
    messagingSenderId: "280973267975",
    appId: "1:280973267975:web:6be8cbf4d2ece640e346a2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// CANDADO DE SEGURIDAD EXCLUSIVO PARA EL ADMIN Y SOPORTE
onAuthStateChanged(auth, (user) => {
    if (!user || user.email !== "jeremymatiasdelrosario@gmail.com") {
        alert("Acceso denegado. Esta área es exclusiva para el personal autorizado.");
        window.location.href = "index.html";
    } else {
        cargarUsuariosSelect();
        cargarTransaccionesAdmin();
        cargarTransferenciasPendientes();
    }
});

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `show ${type}`;
    setTimeout(() => { toast.className = ""; }, 3000);
}

// Cargar lista de usuarios en los selectores del panel admin
async function cargarUsuariosSelect() {
    const selectBalance = document.getElementById("adminSelectUser");
    const selectLoan = document.getElementById("adminLoanSelectUser");
    
    if (!selectBalance && !selectLoan) return;

    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        let options = '<option value="">Seleccione un usuario...</option>';
        
        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            const saldo = user.saldo ?? 0;
            const deuda = user.deuda ?? 0;
            options += `<option value="${docSnap.id}">${user.nombre || 'Sin Nombre'} (${user.email}) - Saldo: $${saldo.toFixed(2)} | Deuda: $${deuda.toFixed(2)}</option>`;
        });

        if (selectBalance) selectBalance.innerHTML = options;
        if (selectLoan) selectLoan.innerHTML = options;
    } catch (e) {
        if (selectBalance) selectBalance.innerHTML = '<option value="">Error al cargar usuarios</option>';
        if (selectLoan) selectLoan.innerHTML = '<option value="">Error al cargar usuarios</option>';
    }
}

// Modificar saldo de usuario (Con cobro automático de deuda si aplica)
document.getElementById("adminBalanceForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("adminSelectUser").value;
    const action = document.getElementById("adminActionType").value;
    const amount = parseFloat(document.getElementById("adminBalanceAmount").value);
    const reason = document.getElementById("adminBalanceReason").value;

    if (!userId) {
        showToast("Por favor selecciona un usuario", "error");
        return;
    }
    if (amount <= 0) {
        showToast("Ingresa un monto válido mayor a 0", "error");
        return;
    }

    try {
        const userRef = doc(db, "usuarios", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            showToast("El usuario no existe", "error");
            return;
        }

        let userData = userSnap.data();
        let saldoActual = userData.saldo ?? 0.00;
        let deudaActual = userData.deuda ?? 0.00;

        if (action === "subtract") {
            if (amount > saldoActual) {
                showToast("El usuario no tiene suficiente saldo para este retiro", "error");
                return;
            }
            saldoActual -= amount;

            await setDoc(userRef, { saldo: saldoActual }, { merge: true });

            await addDoc(collection(db, "transacciones"), {
                userId: userId,
                userEmail: userData.email,
                userName: userData.nombre,
                title: `Ajuste Admin (Retiro): ${reason}`,
                category: "Gestión Administrativa",
                amount: -amount,
                date: new Date().toLocaleString(),
                timestamp: serverTimestamp(),
                estado: "Completado"
            });

        } else {
            // Acción "add" (Depósito): Cubre la deuda primero de forma exacta si existe
            let montoNetoAIngresar = amount;

            if (deudaActual > 0) {
                if (amount >= deudaActual) {
                    montoNetoAIngresar = amount - deudaActual;
                    saldoActual += montoNetoAIngresar;
                    deudaActual = 0; // Deuda saldada
                } else {
                    deudaActual -= amount;
                    montoNetoAIngresar = 0; // Todo el depósito se aplicó a la deuda
                }
            } else {
                saldoActual += amount;
            }

            await setDoc(userRef, { 
                saldo: saldoActual,
                deuda: deudaActual
            }, { merge: true });

            await addDoc(collection(db, "transacciones"), {
                userId: userId,
                userEmail: userData.email,
                userName: userData.nombre,
                title: `Depósito Admin: ${reason}`,
                category: "Gestión Administrativa",
                amount: amount,
                date: new Date().toLocaleString(),
                timestamp: serverTimestamp(),
                estado: "Completado"
            });
        }

        showToast("¡Saldo y deudas actualizados con éxito!");
        e.target.reset();
        cargarUsuariosSelect();
    } catch (err) {
        console.error(err);
        showToast("Error al procesar la operación", "error");
    }
});

// Otorgar Préstamo / Registrar Deuda al usuario
document.getElementById("adminLoanForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("adminLoanSelectUser").value;
    const amount = parseFloat(document.getElementById("adminLoanAmount").value);
    const reason = document.getElementById("adminLoanReason").value;

    if (!userId) {
        showToast("Por favor selecciona un usuario", "error");
        return;
    }
    if (amount <= 0) {
        showToast("Ingresa un monto válido mayor a 0", "error");
        return;
    }

    try {
        const userRef = doc(db, "usuarios", userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            showToast("El usuario no existe", "error");
            return;
        }

        let userData = userSnap.data();
        let saldoActual = userData.saldo ?? 0.00;
        let deudaActual = userData.deuda ?? 0.00;

        // Se incrementa el saldo para que lo pueda usar y se suma a la deuda
        let nuevoSaldo = saldoActual + amount;
        let nuevaDeuda = deudaActual + amount;

        await setDoc(userRef, { 
            saldo: nuevoSaldo,
            deuda: nuevaDeuda
        }, { merge: true });

        await addDoc(collection(db, "transacciones"), {
            userId: userId,
            userEmail: userData.email,
            userName: userData.nombre,
            title: `Préstamo Otorgado: ${reason}`,
            category: "Crédito / Deuda Pendiente",
            amount: amount,
            date: new Date().toLocaleString(),
            timestamp: serverTimestamp(),
            estado: "Completado"
        });

        showToast("¡Préstamo otorgado y deuda registrada con éxito!");
        e.target.reset();
        cargarUsuariosSelect();
    } catch (err) {
        console.error(err);
        showToast("Error al procesar el préstamo", "error");
    }
});

// Registrar nuevo producto en la tienda
document.getElementById("adminAddProductForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("adminProdName").value;
    const price = parseFloat(document.getElementById("adminProdPrice").value);
    const type = document.getElementById("adminProdType").value;

    try {
        await addDoc(collection(db, "productos_tienda"), {
            name: name,
            price: price,
            type: type,
            creado: serverTimestamp()
        });
        showToast("¡Producto agregado a la tienda con éxito!");
        e.target.reset();
    } catch (err) {
        showToast("Error al guardar el producto", "error");
    }
});

// Cargar transferencias pendientes de verificación humana
function cargarTransferenciasPendientes() {
    const container = document.getElementById("adminPendingTransfers");
    if (!container) return;

    const q = query(collection(db, "transacciones"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        let html = "";
        let encontradas = 0;

        snapshot.forEach((docSnap) => {
            const tx = docSnap.data();
            if (tx.estado === "Pendiente de verificación humana") {
                encontradas++;
                html += `
                    <div style="background: var(--bg-dark); padding: 0.85rem; border-radius: 0.5rem; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border); margin-bottom: 0.5rem;">
                        <div>
                            <strong style="color: var(--primary);">${tx.userName || tx.userEmail || 'Usuario'}</strong><br>
                            <span>${tx.title}</span><br>
                            <span style="color: var(--text-muted);">${tx.category} • ${tx.date}</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-weight: bold; color: var(--danger);">-$${Math.abs(tx.amount).toFixed(2)}</span><br>
                            <button class="btn aprobar-tx-btn" data-id="${docSnap.id}" style="margin-top: 0.4rem; padding: 0.3rem 0.8rem; font-size: 0.75rem; width: auto; background: var(--success, #10b981);">Aprobar / Completar</button>
                        </div>
                    </div>
                `;
            }
        });

        if (encontradas === 0) {
            container.innerHTML = "<p style='color:var(--text-muted); text-align:center;'>No hay transferencias pendientes de verificación.</p>";
        } else {
            container.innerHTML = html;
        }

        document.querySelectorAll(".aprobar-tx-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const txId = btn.getAttribute("data-id");
                try {
                    await updateDoc(doc(db, "transacciones", txId), {
                        estado: "Completado",
                        title: "Transferencia Externa Completada"
                    });
                    showToast("¡Transferencia aprobada exitosamente!");
                } catch (err) {
                    showToast("Error al aprobar la transferencia", "error");
                }
            });
        });
    }, (error) => {
        console.error("Error al escuchar transferencias pendientes:", error);
        container.innerHTML = "<p style='color:var(--danger); text-align:center;'>Error al cargar transferencias.</p>";
    });
}

// Escuchar auditoría de transacciones y movimientos reales en tiempo real
function cargarTransaccionesAdmin() {
    const container = document.getElementById("adminLiveTransactions");
    if (!container) return;

    const q = query(collection(db, "transacciones"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        let html = "";
        snapshot.forEach((docSnap) => {
            const tx = docSnap.data();
            const isPositive = tx.amount > 0;
            html += `
                <div class="transaction-item" style="background: var(--bg-dark); padding: 0.75rem; border-radius: 0.5rem; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                    <div>
                        <strong style="color: var(--primary);">${tx.userName || 'Usuario'}</strong> (${tx.userEmail || 'Sin email'})<br>
                        <span>${tx.title}</span><br>
                        <small style="color: var(--text-muted);">${tx.category} • ${tx.date} • Estado: <b>${tx.estado || 'Completado'}</b></small>
                    </div>
                    <div class="tx-amount" style="color: ${isPositive ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)'}; font-weight: bold;">
                        ${isPositive ? '+' : ''}$${Math.abs(tx.amount).toFixed(2)}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html || "<p style='color:var(--text-muted); text-align:center;'>No hay movimientos registrados aún.</p>";
    }, (error) => {
        console.error("Error al escuchar transacciones globales:", error);
        container.innerHTML = "<p style='color:var(--danger); text-align:center;'>Error al cargar transacciones.</p>";
    });
}
