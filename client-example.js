/**
 * Simple Client Example for File Upload
 * 
 * This file demonstrates how to implement file upload functionality
 * in a simple client application.
 */

class ChatFileUploader {
  constructor(apiBaseUrl, token) {
    this.apiBaseUrl = apiBaseUrl;
    this.token = token;
  }

  /**
   * Upload a file and create a message
   * @param {File} file - The file to upload
   * @param {number} chatId - The chat ID
   * @param {number} senderId - The sender's user ID
   * @param {string} messageText - Optional message text
   * @returns {Promise<Object>} The created message with attachment
   */
  async uploadFile(file, chatId, senderId, messageText = '') {
    try {
      // Validate file
      if (!file) {
        throw new Error('No file provided');
      }

      // Check file size (50MB max)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('File size exceeds 50MB limit');
      }

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chat_id', chatId);
      formData.append('sender_id', senderId);
      
      if (messageText) {
        formData.append('message_text', messageText);
      }

      // Upload
      const response = await fetch(`${this.apiBaseUrl}/messages/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  /**
   * Upload with progress tracking
   * @param {File} file - The file to upload
   * @param {number} chatId - The chat ID
   * @param {number} senderId - The sender's user ID
   * @param {string} messageText - Optional message text
   * @param {Function} onProgress - Progress callback (percent)
   * @returns {Promise<Object>} The created message with attachment
   */
  async uploadFileWithProgress(file, chatId, senderId, messageText = '', onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chat_id', chatId);
      formData.append('sender_id', senderId);
      
      if (messageText) {
        formData.append('message_text', messageText);
      }

      const xhr = new XMLHttpRequest();

      // Track progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = (e.loaded / e.total) * 100;
          onProgress(percent);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } else {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      xhr.open('POST', `${this.apiBaseUrl}/messages/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      xhr.send(formData);
    });
  }

  /**
   * Get the file type category
   * @param {string} mimeType - The MIME type
   * @returns {string} The file category
   */
  getFileCategory(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return 'spreadsheet';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
    return 'file';
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// ========================================
// Usage Examples
// ========================================

// Example 1: Simple upload
async function simpleUploadExample() {
  const uploader = new ChatFileUploader('http://localhost:3001/api', 'your-jwt-token');
  
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  
  try {
    const result = await uploader.uploadFile(file, 1, 1, 'Check this out!');
    console.log('Upload successful:', result);
  } catch (error) {
    console.error('Upload failed:', error.message);
  }
}

// Example 2: Upload with progress
async function uploadWithProgressExample() {
  const uploader = new ChatFileUploader('http://localhost:3001/api', 'your-jwt-token');
  
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  const progressBar = document.getElementById('progressBar');
  
  try {
    const result = await uploader.uploadFileWithProgress(
      file,
      1,
      1,
      'Check this out!',
      (percent) => {
        progressBar.style.width = percent + '%';
        progressBar.textContent = Math.round(percent) + '%';
      }
    );
    console.log('Upload successful:', result);
  } catch (error) {
    console.error('Upload failed:', error.message);
  }
}

// Example 3: React Component
/*
import React, { useState } from 'react';
import { ChatFileUploader } from './ChatFileUploader';

function FileUploadComponent({ token, chatId, userId }) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const uploader = new ChatFileUploader('http://localhost:3001/api', token);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Check file size
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File size exceeds 50MB limit');
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError('');

    try {
      const result = await uploader.uploadFileWithProgress(
        file,
        chatId,
        userId,
        message,
        (percent) => setProgress(percent)
      );

      console.log('Upload successful:', result);
      
      // Reset form
      setFile(null);
      setMessage('');
      setProgress(0);
      
      // Notify parent component or update UI
      onUploadSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-upload-component">
      <input
        type="file"
        onChange={handleFileChange}
        disabled={uploading}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
      />
      
      {file && (
        <div className="file-info">
          <p>Selected: {file.name}</p>
          <p>Size: {uploader.formatFileSize(file.size)}</p>
          <p>Type: {uploader.getFileCategory(file.type)}</p>
        </div>
      )}

      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Enter message (optional)"
        disabled={uploading}
      />

      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Send File'}
      </button>

      {uploading && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          >
            {Math.round(progress)}%
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}
*/

// Example 4: Vue.js Component
/*
<template>
  <div class="file-upload">
    <input 
      type="file" 
      @change="handleFileChange" 
      :disabled="uploading"
      ref="fileInput"
    />
    
    <div v-if="file" class="file-info">
      <p>{{ file.name }} ({{ formatFileSize(file.size) }})</p>
    </div>

    <input 
      v-model="message" 
      placeholder="Enter message (optional)"
      :disabled="uploading"
    />

    <button @click="upload" :disabled="!file || uploading">
      {{ uploading ? 'Uploading...' : 'Send File' }}
    </button>

    <div v-if="uploading" class="progress">
      <div class="progress-bar" :style="{ width: progress + '%' }">
        {{ Math.round(progress) }}%
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script>
import { ChatFileUploader } from './ChatFileUploader';

export default {
  name: 'FileUpload',
  props: ['token', 'chatId', 'userId'],
  data() {
    return {
      file: null,
      message: '',
      uploading: false,
      progress: 0,
      error: '',
      uploader: null
    };
  },
  created() {
    this.uploader = new ChatFileUploader('http://localhost:3001/api', this.token);
  },
  methods: {
    handleFileChange(e) {
      this.file = e.target.files[0];
      this.error = '';
    },
    async upload() {
      if (!this.file) return;

      this.uploading = true;
      this.progress = 0;
      this.error = '';

      try {
        const result = await this.uploader.uploadFileWithProgress(
          this.file,
          this.chatId,
          this.userId,
          this.message,
          (percent) => {
            this.progress = percent;
          }
        );

        this.$emit('upload-success', result);
        
        // Reset
        this.file = null;
        this.message = '';
        this.$refs.fileInput.value = '';
      } catch (err) {
        this.error = err.message;
      } finally {
        this.uploading = false;
      }
    },
    formatFileSize(bytes) {
      return this.uploader.formatFileSize(bytes);
    }
  }
};
</script>
*/

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatFileUploader;
}
