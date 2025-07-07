let currentId = "";

let encryptedContentStore = "";
const magicHeader = "ENCNOTE_V1:";
const tempPassword = document.getElementById("tempPassword"); // Lol, bad practice but it's quality of life :D

const editor = document.getElementById("editor");
const passwordOverlay = document.getElementById("password-overlay");
const passwordInput = document.getElementById("password-input");
const decryptButton = document.getElementById("decrypt-button");
const cancelDecryptButton = document.getElementById("cancel-decrypt-button");
const list = document.getElementById("noteList");

let newsnip = false;

function formatText(cmd) {
    if (cmd === "h1") {
        document.execCommand("formatBlock", false, "<h1>");
    } else {
        document.execCommand(cmd, false, null);
    }
}

function loadNotes() {
    fetch("/notes")
        .then((res) => res.json())
        .then((notes) => {
            list.innerHTML = "";
            if (notes) {
                notes.forEach((note) => {
                    const div = document.createElement("div");
                    div.textContent = note.title;
                    div.onclick = () => loadNote(note.title);
                    list.appendChild(div);
                });
            }
        });
}

function hidePasswordPrompt() {
    passwordOverlay.classList.add("hidden");
    editor.classList.remove("blurred");
    passwordInput.value = "";
    encryptedContentStore = "";
}

function showPasswordPrompt() {
    passwordOverlay.classList.remove("hidden");
    editor.classList.add("blurred");
    passwordInput.focus();
}

function loadNote(id) {
    fetch(`/note/${id}`)
        .then((res) => res.text())
        .then((content) => {
            hidePasswordPrompt();
            document.getElementById("noteId").value = id;
            currentId = id;

            if (content.startsWith(magicHeader)) {
                // this is an encrypted note
                tempPassword.innerHTML = "";
                encryptedContentStore = content;
                editor.innerHTML = `<em>Note is encrypted. Enter password to view.</em><br><br><pre style="white-space: pre-wrap; word-wrap: break-word;">${content}</pre>`;
                showPasswordPrompt();
            } else {
                // this is a plaintext (old) note
                tempPassword.innerHTML = "";
                editor.innerHTML = content;
            }
        });
    newsnip = false;
}

function handleDecryption() {
    const password = passwordInput.value;
    if (!password) {
        alert("Please enter a password.");
        return;
    }
    // console.log(encryptedContentStore);

    fetch("/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: encryptedContentStore,
            password: password,
        }),
    })
        .then((res) => {
            if (!res.ok) {
                editor.innerHTML = "Decryption failed. Invalid password?";
                // throw new Error("Decryption failed. Invalid password?");
            }
            tempPassword.innerHTML = "";
            return res.text();
        })
        .then((decryptedHtml) => {
            editor.innerHTML = decryptedHtml;
            tempPassword.innerHTML = password;
            hidePasswordPrompt();
        })
        .catch((error) => {
            alert(error.message);
            tempPassword.innerHTML = "";
            passwordInput.value = "";
            passwordInput.focus();
        });
}

function saveNote() {
    const id = document.getElementById("noteId").value.trim();
    const content = document.getElementById("editor").innerHTML;
    const save_status = document.getElementById("save-status");

    let split_id = id.split(" -");

    split_id = split_id.filter((i) => i !== "");

    function titleExists(searchTitle) {
        const divs = list.querySelectorAll("div");
        return Array.from(divs).some((div) => div.textContent === searchTitle);
    }
    // console.log("save note titleexists: ", titleExists(split_id[0]));
    // console.log(split_id);
    // console.log(id);
    if (split_id.length === 1 && titleExists(split_id[0]) && newsnip) {
        return alert("File already exists!");
    } else if (titleExists(id) && newsnip) {
        return alert("File already exists with this long name!");
    }

    if (!id) return alert("Enter a note name");

    if (tempPassword.innerHTML !== "") {
        if (split_id.length === 1) {
            fetch("/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: split_id[0],
                    content,
                    password: tempPassword.innerHTML,
                }),
            })
                .then((res) => res.text())
                .then((responseText) => {
                    save_status.innerHTML = responseText;
                    loadNotes();
                    hidePasswordPrompt();
                });
        } else {
            fetch("/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    content,
                    password: tempPassword.innerHTML,
                }),
            })
                .then((res) => res.text())
                .then((responseText) => {
                    save_status.innerHTML = responseText;
                    loadNotes();
                    hidePasswordPrompt();
                });
        }
        console.log("saved with password:", tempPassword.innerHTML);
        return;
    }

    // if we dont have a temp password
    const password = prompt("Enter a password to encrypt and save this note:");
    if (!password) {
        alert("A password is required to save the note.");
        return;
    }

    if (split_id.length === 1) {
        fetch("/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: split_id[0], content, password }),
        })
            .then((res) => res.text())
            .then((responseText) => {
                save_status.innerHTML = responseText;
                loadNotes();
                hidePasswordPrompt();
            });
    } else {
        fetch("/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, content, password }),
        })
            .then((res) => res.text())
            .then((responseText) => {
                save_status.innerHTML = responseText;
                loadNotes();
                hidePasswordPrompt();
            });
    }
}

function deleteNote() {
    const id = document.getElementById("noteId").value.trim();
    if (!id) return alert("Enter a note name");
    if (!confirm(`Are you sure you want to delete "${id}"?`)) return;

    fetch("/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    }).then(() => {
        document.getElementById("save-status").innerHTML = "Deleted Note!";
        newSnippet();
        loadNotes();
    });
}

function placeCursorAtEnd(el) {
    el.focus();
    if (
        typeof window.getSelection !== "undefined" &&
        typeof document.createRange !== "undefined"
    ) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);

        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

function newSnippet() {
    const currentdate = new Date();
    const dateString = `${currentdate.getDate()}-${
        currentdate.getMonth() + 1
    }-${currentdate.getFullYear()}`;
    const timeString = `${currentdate.getHours()}:${currentdate.getMinutes()}:${currentdate.getSeconds()}`;

    document.getElementById("noteId").value = `${dateString} - `;
    editor.innerHTML = `<h1>${dateString} @ ${timeString}</h1><br>`;
    document.getElementById("save-status").innerHTML = "New snippet started";
    currentId = "";
    tempPassword.innerHTML = "";
    newsnip = true;
    hidePasswordPrompt();
    editor.focus();
    placeCursorAtEnd(editor);
}

function insertLink() {
    const url = prompt("Enter the URL:");
    if (url) {
        document.execCommand("createLink", false, url);
    }
}
function setColor(color) {
    document.execCommand("foreColor", false, color);
}
document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveNote();
    }
});
document.getElementById("editor").addEventListener("paste", function (e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const items = clipboardData.items;
    if (items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function (event) {
                    const wrapper = document.createElement("div");
                    wrapper.style.display = "block";
                    wrapper.style.margin = "10px 0";
                    const img = document.createElement("img");
                    img.src = event.target.result;
                    img.alt = "Pasted Image";
                    img.setAttribute("contenteditable", "false");
                    img.style.maxWidth = "600px";
                    img.style.maxHeight = "400px";
                    img.style.width = "auto";
                    img.style.height = "auto";
                    img.style.display = "block";
                    img.style.pointerEvents = "auto";
                    img.style.userSelect = "auto";
                    wrapper.appendChild(img);
                    const selection = window.getSelection();
                    if (!selection.rangeCount) return;
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(wrapper);
                    range.setStartAfter(wrapper);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
    }
    const text = clipboardData.getData("text/plain");
    if (text) {
        e.preventDefault();
        document.execCommand("insertText", false, text);
    }
});

decryptButton.addEventListener("click", handleDecryption);
cancelDecryptButton.addEventListener("click", () => {
    hidePasswordPrompt();
    editor.innerHTML = "";
    document.getElementById("noteId").value = "";
});
passwordInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
        handleDecryption();
    }
});

window.onload = loadNotes;
