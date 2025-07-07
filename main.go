package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/scrypt"
)

const magicHeader = "ENCNOTE_V1:"

type Note struct {
	ID       string `json:"id"`
	Title    string `json:"title,omitempty"`
	Content  string `json:"content,omitempty"`
	Password string `json:"password,omitempty"`
}

// -------------------------------------------------------------------------------------

func discard(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func copyFile(src string, dst string) {
	data, err := os.ReadFile(src)
	discard(err)
	err = os.WriteFile(dst, data, 0644)
	discard(err)
}

func fileExists(filename string) bool {
	info, err := os.Stat(filename)
	if os.IsNotExist(err) {
		return false
	}
	return !info.IsDir()
}

// -------------------------------------------------------------------------------------

func encrypt(data []byte, password string) ([]byte, error) {
	salt := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}
	key, err := scrypt.Key([]byte(password), salt, 16384, 8, 1, 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nonce, nonce, data, nil)
	return append(salt, ciphertext...), nil
}

func decrypt(data []byte, password string) ([]byte, error) {
	salt, data := data[:32], data[32:]
	key, err := scrypt.Key([]byte(password), salt, 16384, 8, 1, 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}
	return plaintext, nil
}

func main() {
	os.MkdirAll("notes", 0755)
	http.Handle("/", http.FileServer(http.Dir("./static")))
	http.HandleFunc("/save", saveNote)
	http.HandleFunc("/notes", listNotes)
	http.HandleFunc("/note/", getNote)
	http.HandleFunc("/delete", deleteNote)
	http.HandleFunc("/decrypt", decryptNoteHandler)
	fmt.Println("Server is running on http://localhost:8081")
	err := http.ListenAndServe(":8081", nil)
	if err != nil {
		fmt.Println("Error starting server:", err)
		os.Exit(1)
	}
}

func getNote(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/note/")
	data, err := os.ReadFile(filepath.Join("notes", id+".html"))
	if err != nil {
		http.Error(w, "Note not found", http.StatusNotFound)
		return
	}
	w.Write(data)
}

func decryptNoteHandler(w http.ResponseWriter, r *http.Request) {
	var note Note
	if err := json.NewDecoder(r.Body).Decode(&note); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// remove the magic header before decoding
	contentToProcess := strings.TrimPrefix(note.Content, magicHeader)
	encryptedData, err := hex.DecodeString(contentToProcess)
	if err != nil {
		http.Error(w, "Invalid content format", http.StatusBadRequest)
		return
	}

	decryptedData, err := decrypt(encryptedData, note.Password)
	if err != nil {
		http.Error(w, "Decryption failed. Invalid password?", http.StatusUnauthorized)
		return
	}
	w.Write(decryptedData)
}

func saveNote(w http.ResponseWriter, r *http.Request) {

	var note Note
	if err := json.NewDecoder(r.Body).Decode(&note); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if note.Password == "" {
		http.Error(w, "Password is required for encryption", http.StatusBadRequest)
		return
	}

	encryptedContent, err := encrypt([]byte(note.Content), note.Password)
	if err != nil {
		http.Error(w, "Failed to encrypt note", http.StatusInternalServerError)
		return
	}

	// combine header + hex-encoded data, store as a string
	finalContent := magicHeader + hex.EncodeToString(encryptedContent)
	fmt.Println("Saving ", filepath.Join("notes", note.ID+".html"))
	err = os.WriteFile(filepath.Join("notes", note.ID+".html"), []byte(finalContent), 0644)
	if err != nil {
		http.Error(w, "Failed to save note", http.StatusInternalServerError)
		return
	}
	w.Write([]byte("Note saved and encrypted"))

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
		filename := strings.TrimSuffix(f.Name(), filepath.Ext(f.Name()))
		datePart := strings.Split(filename, " - ")[0]
		t, err := time.Parse("2-1-2006", datePart)
		if err != nil {
			notes = append(notes, Note{ID: filename, Title: filename})
			continue
		}
		timestamp := t.Unix()
		notes = append(notes, Note{
			ID:    strconv.FormatInt(timestamp, 10),
			Title: filename,
		})
	}
	sort.Slice(notes, func(i, j int) bool {
		idI, _ := strconv.ParseInt(notes[i].ID, 10, 64)
		idJ, _ := strconv.ParseInt(notes[j].ID, 10, 64)
		return idI > idJ
	})
	json.NewEncoder(w).Encode(notes)
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
	fileName := id + ".html"
	if _, err := os.Stat(filepath.Join("notes", fileName)); err == nil {
		fmt.Println("Attempting to delete " + id)
		copyFile(filepath.Join("notes", fileName), filepath.Join("notes", "deletebackup_"+fileName))
		err = os.Remove(filepath.Join("notes", fileName))
		if err != nil {
			w.Write([]byte("Failed to delete file!"))
			fmt.Println("Failed to delete file!")
			return
		}
		w.Write([]byte("Deleted file: " + id))
		fmt.Println("Deleted file: " + id)
	}
}
