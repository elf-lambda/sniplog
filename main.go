package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Util

func discard(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
func copyFile(src string, dst string) {
	// Read all content of src to data, may cause OOM for a large file.
	data, err := os.ReadFile(src)
	discard(err)
	// Write data to dst
	err = os.WriteFile(dst, data, 0644)
	discard(err)
}

// Util

type Note struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content,omitempty"`
}

func main() {
	os.MkdirAll("notes", 0755)

	http.Handle("/", http.FileServer(http.Dir("./static")))
	http.HandleFunc("/save", saveNote)
	http.HandleFunc("/notes", listNotes)
	http.HandleFunc("/note/", getNote)
	http.HandleFunc("/delete", deleteNote)

	fmt.Println("Server is running on http://localhost:8081")
	err := http.ListenAndServe(":8081", nil)
	if err != nil {
		fmt.Println("Error starting server:", err)
		os.Exit(1)
	}
}

func listNotes(w http.ResponseWriter, r *http.Request) {
	files, err := os.ReadDir("notes")
	if err != nil {
		http.Error(w, "Failed to read notes directory", http.StatusInternalServerError)
		return
	}

	var notes []Note
	for _, f := range files {
		if strings.Contains(f.Name(), "deletebackup_") {
			continue
		}
		id := strings.TrimSuffix(f.Name(), filepath.Ext(f.Name()))
		notes = append(notes, Note{ID: id, Title: id})
	}

	json.NewEncoder(w).Encode(notes)
}

func getNote(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/note/")
	data, err := os.ReadFile(filepath.Join("notes", id+".html"))
	if err != nil {
		http.Error(w, "Note not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(Note{ID: id, Title: id, Content: string(data)})
}

func deleteNote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	var note Note
	if err := json.NewDecoder(r.Body).Decode(&note); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	id := note.ID
	file_name := id + ".html"

	if _, err := os.Stat(filepath.Join("notes", file_name)); err == nil {
		// Make backup
		fmt.Println("Attempting to delete " + id)
		copyFile(filepath.Join("notes", file_name), filepath.Join("notes", "deletebackup_"+file_name))
		err = os.Remove(filepath.Join("notes", file_name))
		if err != nil {
			w.Write([]byte("Failed to delete file!"))
			fmt.Println("Failed to delete file!")
		}
		w.Write([]byte("Deleted file: " + id))
		fmt.Println("Deleted file: " + id)
	}
}

func saveNote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}
	var note Note
	if err := json.NewDecoder(r.Body).Decode(&note); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	err := os.WriteFile(filepath.Join("notes", note.ID+".html"), []byte(note.Content), 0644)
	if err != nil {
		http.Error(w, "Failed to save note", http.StatusInternalServerError)
		return
	}
	w.Write([]byte("Note saved"))
}
