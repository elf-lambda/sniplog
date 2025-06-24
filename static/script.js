let currentId = "";

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
            const list = document.getElementById("noteList");
            list.innerHTML = "";
            if (notes) {
                notes.forEach((note) => {
                    const div = document.createElement("div");
                    div.textContent = note.title;
                    div.onclick = () => loadNote(note.id);
                    list.appendChild(div);
                });
            }
        });
}

function loadNote(id) {
    fetch(`/note/${id}`)
        .then((res) => res.json())
        .then((note) => {
            document.getElementById("noteId").value = note.id;
            document.getElementById("editor").innerHTML = note.content;
            currentId = note.id;
        });
}

function saveNote() {
    const id = document.getElementById("noteId").value.trim();
    const content = document.getElementById("editor").innerHTML;
    const save_status = document.getElementById("save-status");
    if (!id) return alert("Enter a note name");

    fetch("/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content }),
    }).then(() => {
        // alert("Note saved!");
        save_status.innerHTML = "Note Saved!";
        loadNotes();
    });
}

function deleteNote() {
    const id = document.getElementById("noteId").value.trim();
    const save_status = document.getElementById("save-status");
    const content = document.getElementById("editor");
    if (!id) return alert("Enter a note name");

    console.log("Attempting to delete " + id);
    fetch("/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
    }).then(() => {
        save_status.innerHTML = "Deleted Note!";
        content.innerHTML = "";
        document.getElementById("noteId").value = "";
        loadNotes();
    });
    newSnippet();
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

function newSnippet() {
    const currentdate = new Date();
    document.getElementById("noteId").value =
        currentdate.getDate() +
        "-" +
        (currentdate.getMonth() + 1) +
        "-" +
        currentdate.getFullYear();
    document.getElementById("editor").innerHTML = "";
    document.getElementById("save-status").innerHTML = "New snippet started";
    currentId = "";
    document.getElementById("editor").innerHTML =
        currentdate.getDate() +
        "/" +
        (currentdate.getMonth() + 1) +
        "/" +
        currentdate.getFullYear() +
        " @ " +
        currentdate.getHours() +
        ":" +
        currentdate.getMinutes() +
        ":" +
        currentdate.getSeconds() +
        "<br><br><br>";
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
                    const img = document.createElement("img");
                    img.src = event.target.result;
                    img.alt = "Pasted Image";
                    img.style.maxWidth = "600px";
                    img.style.maxHeight = "400px";
                    img.style.width = "auto";
                    img.style.height = "auto";

                    // Insert image at caret position
                    const selection = window.getSelection();
                    if (!selection.rangeCount) return;
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(img);

                    // Move cursor after image
                    range.setStartAfter(img);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                };

                reader.readAsDataURL(blob);
                return;
            }
        }
    }

    // If no image fallback to plain text paste
    const text = clipboardData.getData("text/plain");
    if (text) {
        e.preventDefault();
        document.execCommand("insertText", false, text);
    }
});

window.onload = loadNotes;
