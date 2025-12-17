import React from 'react';
import Head from 'next/head';
import { ImageCarousel } from '../components/ImageCarousel';
import { useCarousel } from '../hooks/useCarousel';

const HomePage: React.FC = () => {
  const {
    items,
    loading,
    error,
    onSlideChange,
    onItemClick
  } = useCarousel({
    autoRefresh: true,
    refreshInterval: 300000, // 5 minutes
    onItemView: (itemId) => {
      // Track view analytics
      console.log('Carousel item viewed:', itemId);
    },
    onItemClick: (itemId) => {
      // Track click analytics
      console.log('Carousel item clicked:', itemId);
    }
  });

  if (error) {
    return (
      <div className="error-container">
        <Head>
          <title>Photography Portfolio</title>
          <meta name="description" content="Professional photography portfolio" />
        </Head>
        <div className="error-message">
          <h1>Unable to load carousel</h1>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Photography Portfolio - Capturing Life's Beautiful Moments</title>
        <meta 
          name="description" 
          content="Professional photography portfolio showcasing stunning landscapes, portraits, and artistic photography. Explore our latest work and creative vision." 
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Photography Portfolio" />
        <meta property="og:description" content="Professional photography portfolio showcasing stunning visual stories" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={process.env.NEXT_PUBLIC_SITE_URL} />
        <meta property="og:image" content={`${process.env.NEXT_PUBLIC_SITE_URL}/og-image.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={process.env.NEXT_PUBLIC_SITE_URL} />
        
        {/* Preload critical resources */}
        {items.length > 0 && (
          <>
            <link
              rel="preload"
              as="image"
              href={`${process.env.NEXT_PUBLIC_IMAGE_DOMAIN}/${items[0].imagePath}?w=1920&f=webp&auto=true`}
            />
            {items[0].mobileImagePath && (
              <link
                rel="preload"
                as="image"
                href={`${process.env.NEXT_PUBLIC_IMAGE_DOMAIN}/${items[0].mobileImagePath}?w=768&f=webp&auto=true`}
                media="(max-width: 767px)"
              />
            )}
          </>
        )}
      </Head>

      <main>
        {loading ? (
          <div className="carousel-loading">
            <div className="loading-spinner" aria-label="Loading portfolio" />
          </div>
        ) : (
          <ImageCarousel
            items={items}
            autoPlay={true}
            autoPlayInterval={5000}
            showControls={true}
            showIndicators={true}
            onSlideChange={onSlideChange}
            onItemClick={onItemClick}
            className="hero-carousel"
          />
        )}

        {/* Skip link for accessibility */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        {/* Main content section */}
        <section id="main-content" className="main-content">
          {/* Additional page content would go here */}
        </section>
      </main>

      <style jsx>{`
        .error-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          background: #000;
          color: white;
        }

        .error-message {
          text-align: center;
          max-width: 500px;
        }

        .error-message h1 {
          font-size: 2rem;
          margin-bottom: 1rem;
        }

        .error-message p {
          margin-bottom: 2rem;
          opacity: 0.8;
        }

        .error-message button {
          padding: 0.75rem 1.5rem;
          background: white;
          color: black;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .error-message button:hover {
          background: #f0f0f0;
        }

        .skip-link {
          position: absolute;
          top: -40px;
          left: 6px;
          background: #000;
          color: white;
          padding: 8px;
          text-decoration: none;
          border-radius: 4px;
          z-index: 1000;
        }

        .skip-link:focus {
          top: 6px;
        }

        .main-content {
          min-height: 100vh;
          /* Additional content styles */
        }
      `}</style>
    </>
  );
};

export default HomePage;
