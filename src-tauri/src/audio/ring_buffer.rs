//! 环形缓冲区实现
//!
//! 提供高性能的无锁环形缓冲区，用于音频数据的生产者-消费者模式

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// 环形缓冲区
///
/// 支持单生产者单消费者（SPSC）模式的无锁环形缓冲区
pub struct RingBuffer<T> {
    /// 内部缓冲区
    buffer: Box<[T]>,
    /// 写入位置（生产者）
    head: AtomicUsize,
    /// 读取位置（消费者）
    tail: AtomicUsize,
    /// 缓冲区容量
    capacity: usize,
}

impl<T: Copy + Default> RingBuffer<T> {
    /// 创建新的环形缓冲区
    ///
    /// # Arguments
    /// * `capacity` - 缓冲区容量（元素数量）
    ///
    /// # Returns
    /// 新的环形缓冲区实例
    pub fn new(capacity: usize) -> Self {
        let mut buffer = Vec::with_capacity(capacity);
        buffer.resize(capacity, T::default());

        Self {
            buffer: buffer.into_boxed_slice(),
            head: AtomicUsize::new(0),
            tail: AtomicUsize::new(0),
            capacity,
        }
    }

    /// 获取缓冲区容量
    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// 获取当前可读取的元素数量
    pub fn len(&self) -> usize {
        let head = self.head.load(Ordering::Acquire);
        let tail = self.tail.load(Ordering::Acquire);

        if head >= tail {
            head - tail
        } else {
            self.capacity - tail + head
        }
    }

    /// 检查缓冲区是否为空
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 检查缓冲区是否已满
    #[inline]
    pub fn is_full(&self) -> bool {
        self.len() == self.capacity - 1
    }

    /// 获取可用的写入空间
    pub fn available(&self) -> usize {
        self.capacity - 1 - self.len()
    }

    /// 写入数据到缓冲区
    ///
    /// # Arguments
    /// * `items` - 要写入的数据切片
    ///
    /// # Returns
    /// 实际写入的元素数量
    pub fn push(&self, items: &[T]) -> usize {
        let available = self.available();
        let to_write = items.len().min(available);

        if to_write == 0 {
            return 0;
        }

        let head = self.head.load(Ordering::Relaxed);

        for (i, item) in items.iter().take(to_write).enumerate() {
            let pos = (head + i) % self.capacity;
            // SAFETY: 我们确保 pos 在有效范围内
            unsafe {
                let ptr = self.buffer.as_ptr() as *mut T;
                ptr.add(pos).write(*item);
            }
        }

        // 更新 head 指针
        let new_head = (head + to_write) % self.capacity;
        self.head.store(new_head, Ordering::Release);

        to_write
    }

    /// 从缓冲区读取数据
    ///
    /// # Arguments
    /// * `out` - 输出缓冲区
    ///
    /// # Returns
    /// 实际读取的元素数量
    pub fn pop(&self, out: &mut [T]) -> usize {
        let available = self.len();
        let to_read = out.len().min(available);

        if to_read == 0 {
            return 0;
        }

        let tail = self.tail.load(Ordering::Relaxed);

        for (i, item) in out.iter_mut().take(to_read).enumerate() {
            let pos = (tail + i) % self.capacity;
            *item = self.buffer[pos];
        }

        // 更新 tail 指针
        let new_tail = (tail + to_read) % self.capacity;
        self.tail.store(new_tail, Ordering::Release);

        to_read
    }

    /// 清空缓冲区
    pub fn clear(&self) {
        let head = self.head.load(Ordering::Relaxed);
        self.tail.store(head, Ordering::Release);
    }
}

// SAFETY: RingBuffer 可以安全地在线程间共享
unsafe impl<T: Copy + Default + Send> Send for RingBuffer<T> {}
unsafe impl<T: Copy + Default + Send> Sync for RingBuffer<T> {}

// ============================================================================
// 生产者/消费者句柄
// ============================================================================

/// 环形缓冲区生产者
pub struct RingBufferProducer<T> {
    buffer: Arc<RingBuffer<T>>,
}

impl<T: Copy + Default> RingBufferProducer<T> {
    /// 写入数据
    pub fn push(&self, items: &[T]) -> usize {
        self.buffer.push(items)
    }

    /// 获取可用写入空间
    pub fn available(&self) -> usize {
        self.buffer.available()
    }

    /// 检查是否已满
    pub fn is_full(&self) -> bool {
        self.buffer.is_full()
    }
}

/// 环形缓冲区消费者
pub struct RingBufferConsumer<T> {
    buffer: Arc<RingBuffer<T>>,
}

impl<T: Copy + Default> RingBufferConsumer<T> {
    /// 读取数据
    pub fn pop(&self, out: &mut [T]) -> usize {
        self.buffer.pop(out)
    }

    /// 获取可读取数量
    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    /// 检查是否为空
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }
}

/// 创建生产者/消费者对
///
/// # Arguments
/// * `capacity` - 缓冲区容量
///
/// # Returns
/// (生产者, 消费者) 元组
pub fn ring_buffer_pair<T: Copy + Default>(
    capacity: usize,
) -> (RingBufferProducer<T>, RingBufferConsumer<T>) {
    let buffer = Arc::new(RingBuffer::new(capacity));
    let producer = RingBufferProducer {
        buffer: buffer.clone(),
    };
    let consumer = RingBufferConsumer { buffer };
    (producer, consumer)
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_basic() {
        let buffer = RingBuffer::<f32>::new(16);

        assert!(buffer.is_empty());
        assert!(!buffer.is_full());
        assert_eq!(buffer.len(), 0);

        let data = [1.0, 2.0, 3.0, 4.0];
        let written = buffer.push(&data);
        assert_eq!(written, 4);
        assert_eq!(buffer.len(), 4);

        let mut out = [0.0f32; 2];
        let read = buffer.pop(&mut out);
        assert_eq!(read, 2);
        assert_eq!(out, [1.0, 2.0]);
        assert_eq!(buffer.len(), 2);
    }

    #[test]
    fn test_ring_buffer_wrap_around() {
        let buffer = RingBuffer::<u8>::new(8);

        // 写入 5 个元素
        let data1 = [1, 2, 3, 4, 5];
        buffer.push(&data1);

        // 读取 3 个元素
        let mut out = [0u8; 3];
        buffer.pop(&mut out);
        assert_eq!(out, [1, 2, 3]);

        // 再写入 5 个元素（会绕回）
        let data2 = [6, 7, 8, 9, 10];
        let written = buffer.push(&data2);
        assert_eq!(written, 5);

        // 读取所有剩余元素
        let mut out = [0u8; 7];
        let read = buffer.pop(&mut out);
        assert_eq!(read, 7);
        assert_eq!(&out[..7], &[4, 5, 6, 7, 8, 9, 10]);
    }

    #[test]
    fn test_ring_buffer_full() {
        let buffer = RingBuffer::<i32>::new(4);

        // 只能写入 capacity - 1 = 3 个元素
        let data = [1, 2, 3, 4, 5];
        let written = buffer.push(&data);
        assert_eq!(written, 3);
        assert!(buffer.is_full());
    }

    #[test]
    fn test_ring_buffer_producer_consumer() {
        let (producer, consumer) = ring_buffer_pair::<f32>(1024);

        let data = [0.5, -0.5, 0.25, -0.25];
        producer.push(&data);

        assert_eq!(consumer.len(), 4);

        let mut out = [0.0f32; 4];
        consumer.pop(&mut out);
        assert_eq!(out, data);
    }

    #[test]
    fn test_ring_buffer_clear() {
        let buffer = RingBuffer::<f32>::new(16);

        buffer.push(&[1.0, 2.0, 3.0]);
        assert_eq!(buffer.len(), 3);

        buffer.clear();
        assert!(buffer.is_empty());
    }
}

