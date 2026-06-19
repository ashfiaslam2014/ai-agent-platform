"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import NavBar from "@/components/NavBar";

type Business = {
  id: string;
  name: string;
};

type Document = {
  id: string;
  business_id: string;
  content: string | null;
  metadata: any;
  created_at: string;
};

export default function DocumentManagementPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Upload State
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Edit State
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete State
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    const fetchBusinesses = async () => {
      const { data, error } = await supabase.from("businesses").select("id, name");
      if (!error && data) {
        setBusinesses(data);
        if (data.length > 0) {
          setSelectedBusinessId(data[0].id);
        }
      } else {
        console.error("Failed to fetch businesses:", error);
      }
    };
    fetchBusinesses();
  }, []);

  const fetchDocuments = async () => {
    if (!selectedBusinessId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("id, business_id, content, metadata, created_at")
      .eq("business_id", selectedBusinessId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDocuments(data);
    } else {
      console.error("Failed to fetch documents:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDocuments();
  }, [selectedBusinessId]);

  const handleBusinessChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBusinessId(e.target.value);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusinessId || !uploadContent.trim()) return;

    setIsUploading(true);
    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_id: selectedBusinessId,
          title: uploadTitle.trim(),
          content: uploadContent.trim(),
        }),
      });

      if (response.ok) {
        setUploadTitle("");
        setUploadContent("");
        await fetchDocuments();
      } else {
        alert("Failed to upload document");
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      alert("Error uploading document");
    } finally {
      setIsUploading(false);
    }
  };

  const startEdit = (doc: Document) => {
    setEditingDocId(doc.id);
    setEditContent(doc.content || "");
  };

  const cancelEdit = () => {
    setEditingDocId(null);
    setEditContent("");
  };

  const handleSaveEdit = async (docId: string) => {
    if (!editContent.trim()) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (response.ok) {
        setEditingDocId(null);
        await fetchDocuments();
      } else {
        alert("Failed to update document");
      }
    } catch (error) {
      console.error("Error updating document:", error);
      alert("Error updating document");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this document?");
    if (!confirmDelete) return;

    setIsDeleting(id);
    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      } else {
        console.error("Failed to delete document from API");
        alert("Failed to delete document.");
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Error deleting document.");
    } finally {
      setIsDeleting(null);
    }
  };

  const getDisplayTitle = (doc: Document) => {
    const metaTitle = doc.metadata?.title;
    if (metaTitle && metaTitle.trim() !== "") return metaTitle;
    if (doc.content) {
      return doc.content.length > 50 ? doc.content.slice(0, 50) + "..." : doc.content;
    }
    return "Untitled Document";
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100">
      <NavBar />
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Document Management
        </h1>
        <div className="flex items-center space-x-4">
          <label htmlFor="businessSelect" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Select Business:
          </label>
          <select
            id="businessSelect"
            value={selectedBusinessId || ""}
            onChange={handleBusinessChange}
            className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px] text-zinc-900 dark:text-zinc-100"
            disabled={isLoading || businesses.length === 0}
          >
            {businesses.length === 0 ? (
              <option value="">Loading...</option>
            ) : (
              businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      {/* Upload Section */}
      <section className="mb-10 bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <h2 className="text-lg font-medium mb-4 text-zinc-900 dark:text-zinc-100">Upload New Document</h2>
        <form onSubmit={handleUpload} className="flex flex-col space-y-4">
          <div>
            <label htmlFor="uploadTitle" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Title (Optional)
            </label>
            <input
              id="uploadTitle"
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. Employee Handbook"
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100"
              disabled={isUploading || !selectedBusinessId}
            />
          </div>
          <div>
            <label htmlFor="uploadContent" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              id="uploadContent"
              value={uploadContent}
              onChange={(e) => setUploadContent(e.target.value)}
              placeholder="Paste document content here..."
              rows={5}
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100 resize-y"
              disabled={isUploading || !selectedBusinessId}
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUploading || !selectedBusinessId || !uploadContent.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[160px]"
            >
              {isUploading ? "Uploading..." : "Upload Document"}
            </button>
          </div>
        </form>
      </section>

      {/* Document List Section */}
      <section className="flex-1">
        <h2 className="text-lg font-medium mb-4 text-zinc-900 dark:text-zinc-100">Existing Documents</h2>
        {isLoading ? (
          <div className="flex items-center justify-center text-zinc-400 py-12 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <p>Loading documents...</p>
          </div>
        ) : documents.length === 0 && selectedBusinessId ? (
          <div className="flex items-center justify-center text-zinc-400 py-12 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <p>No documents found for this business.</p>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col shadow-sm transition-shadow"
              >
                {editingDocId === doc.id ? (
                  <div className="flex flex-col space-y-4">
                    <h3 className="font-medium text-zinc-500 dark:text-zinc-400 text-sm">Editing Document</h3>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={8}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
                      disabled={isSaving}
                    />
                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={cancelEdit}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(doc.id)}
                        disabled={isSaving || !editContent.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 flex items-center min-w-[80px] justify-center"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 mb-4">
                      <h3 className="font-medium text-lg leading-tight mb-2 text-zinc-900 dark:text-zinc-50 break-words">
                        {getDisplayTitle(doc)}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                        Created: {formatDate(doc.created_at)}
                      </p>
                      <div className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-3 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-md border border-zinc-100 dark:border-zinc-800/80">
                        {doc.content}
                      </div>
                    </div>
                    <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end space-x-3">
                      <button
                        onClick={() => startEdit(doc)}
                        className="px-4 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={isDeleting === doc.id}
                        className="px-4 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-950/30 dark:hover:bg-red-900/50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeleting === doc.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
