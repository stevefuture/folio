import React, { useState, useRef } from 'react';
import { announceToScreenReader } from '../lib/accessibility';

interface FormData {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  services: string[];
  budget: string;
  timeline: string;
}

interface FormErrors {
  [key: string]: string;
}

export const AccessibleContactForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    services: [],
    budget: '',
    timeline: ''
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  const formRef = useRef<HTMLFormElement>(null);
  
  // Validate form fields
  const validateField = (name: string, value: string | string[]): string => {
    switch (name) {
      case 'name':
        return !value || (value as string).trim().length < 2 
          ? 'Name must be at least 2 characters long' 
          : '';
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return !emailRegex.test(value as string) 
          ? 'Please enter a valid email address' 
          : '';
      case 'subject':
        return !value || (value as string).trim().length < 5 
          ? 'Subject must be at least 5 characters long' 
          : '';
      case 'message':
        return !value || (value as string).trim().length < 10 
          ? 'Message must be at least 10 characters long' 
          : '';
      default:
        return '';
    }
  };
  
  // Handle input changes
  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = event.target;
    
    if (type === 'checkbox') {
      const checkbox = event.target as HTMLInputElement;
      const currentServices = formData.services;
      
      setFormData(prev => ({
        ...prev,
        services: checkbox.checked
          ? [...currentServices, value]
          : currentServices.filter(service => service !== value)
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
      
      // Clear error when user starts typing
      if (errors[name]) {
        setErrors(prev => ({ ...prev, [name]: '' }));
      }
    }
  };
  
  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Validate all fields
    const newErrors: FormErrors = {};
    Object.keys(formData).forEach(key => {
      if (key !== 'services' && key !== 'phone' && key !== 'budget' && key !== 'timeline') {
        const error = validateField(key, formData[key as keyof FormData]);
        if (error) newErrors[key] = error;
      }
    });
    
    setErrors(newErrors);
    
    // If there are errors, focus on first error field and announce
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      const errorElement = formRef.current?.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
      errorElement?.focus();
      
      announceToScreenReader(
        `Form has ${Object.keys(newErrors).length} errors. Please correct them and try again.`,
        'assertive'
      );
      return;
    }
    
    // Submit form
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        setSubmitStatus('success');
        announceToScreenReader('Form submitted successfully! We will get back to you soon.', 'assertive');
        
        // Reset form
        setFormData({
          name: '',
          email: '',
          phone: '',
          subject: '',
          message: '',
          services: [],
          budget: '',
          timeline: ''
        });
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      setSubmitStatus('error');
      announceToScreenReader('There was an error submitting the form. Please try again.', 'assertive');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <section aria-labelledby="contact-heading">
      <h2 id="contact-heading">Contact for Photography Services</h2>
      <p>
        Fill out the form below to inquire about photography services. 
        Fields marked with an asterisk (*) are required.
      </p>
      
      {/* Success/Error Messages */}
      {submitStatus === 'success' && (
        <div className="alert alert-success" role="alert" aria-live="polite">
          <h3>Thank you for your inquiry!</h3>
          <p>We have received your message and will get back to you within 24 hours.</p>
        </div>
      )}
      
      {submitStatus === 'error' && (
        <div className="alert alert-error" role="alert" aria-live="assertive">
          <h3>Submission Error</h3>
          <p>There was an error submitting your form. Please try again or contact us directly.</p>
        </div>
      )}
      
      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        {/* Contact Information */}
        <fieldset>
          <legend>Contact Information</legend>
          
          <div className="form-group">
            <label htmlFor="name" className="required">
              Full Name <span aria-label="required">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              aria-describedby={errors.name ? 'name-error' : 'name-help'}
              aria-invalid={!!errors.name}
              className={errors.name ? 'error' : ''}
            />
            <div id="name-help" className="help-text">
              Enter your full name as you'd like to be addressed
            </div>
            {errors.name && (
              <div id="name-error" className="error-message" role="alert">
                {errors.name}
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="email" className="required">
              Email Address <span aria-label="required">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              aria-describedby={errors.email ? 'email-error' : 'email-help'}
              aria-invalid={!!errors.email}
              className={errors.email ? 'error' : ''}
            />
            <div id="email-help" className="help-text">
              We'll use this to respond to your inquiry
            </div>
            {errors.email && (
              <div id="email-error" className="error-message" role="alert">
                {errors.email}
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="phone">Phone Number (optional)</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              aria-describedby="phone-help"
            />
            <div id="phone-help" className="help-text">
              Include area code for faster response
            </div>
          </div>
        </fieldset>
        
        {/* Inquiry Details */}
        <fieldset>
          <legend>Inquiry Details</legend>
          
          <div className="form-group">
            <label htmlFor="subject" className="required">
              Subject <span aria-label="required">*</span>
            </label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleInputChange}
              required
              aria-describedby={errors.subject ? 'subject-error' : 'subject-help'}
              aria-invalid={!!errors.subject}
              className={errors.subject ? 'error' : ''}
            />
            <div id="subject-help" className="help-text">
              Brief description of your photography needs
            </div>
            {errors.subject && (
              <div id="subject-error" className="error-message" role="alert">
                {errors.subject}
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="message" className="required">
              Message <span aria-label="required">*</span>
            </label>
            <textarea
              id="message"
              name="message"
              rows={6}
              value={formData.message}
              onChange={handleInputChange}
              required
              aria-describedby={errors.message ? 'message-error' : 'message-help'}
              aria-invalid={!!errors.message}
              className={errors.message ? 'error' : ''}
            />
            <div id="message-help" className="help-text">
              Tell us about your event, vision, and any specific requirements
            </div>
            {errors.message && (
              <div id="message-error" className="error-message" role="alert">
                {errors.message}
              </div>
            )}
          </div>
        </fieldset>
        
        {/* Service Selection */}
        <fieldset>
          <legend>Services of Interest (select all that apply)</legend>
          
          <div className="checkbox-group" role="group" aria-labelledby="services-legend">
            {[
              { value: 'wedding', label: 'Wedding Photography' },
              { value: 'portrait', label: 'Portrait Sessions' },
              { value: 'event', label: 'Event Photography' },
              { value: 'commercial', label: 'Commercial Photography' },
              { value: 'landscape', label: 'Landscape Photography' }
            ].map(service => (
              <div key={service.value} className="checkbox-item">
                <input
                  type="checkbox"
                  id={service.value}
                  name="services"
                  value={service.value}
                  checked={formData.services.includes(service.value)}
                  onChange={handleInputChange}
                />
                <label htmlFor={service.value}>{service.label}</label>
              </div>
            ))}
          </div>
        </fieldset>
        
        {/* Additional Information */}
        <fieldset>
          <legend>Additional Information (optional)</legend>
          
          <div className="form-group">
            <label htmlFor="budget">Budget Range</label>
            <select
              id="budget"
              name="budget"
              value={formData.budget}
              onChange={handleInputChange}
            >
              <option value="">Select budget range</option>
              <option value="under-1000">Under $1,000</option>
              <option value="1000-2500">$1,000 - $2,500</option>
              <option value="2500-5000">$2,500 - $5,000</option>
              <option value="5000-plus">$5,000+</option>
              <option value="discuss">Prefer to discuss</option>
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="timeline">Timeline</label>
            <select
              id="timeline"
              name="timeline"
              value={formData.timeline}
              onChange={handleInputChange}
            >
              <option value="">Select timeline</option>
              <option value="asap">As soon as possible</option>
              <option value="1-month">Within 1 month</option>
              <option value="3-months">Within 3 months</option>
              <option value="6-months">Within 6 months</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
        </fieldset>
        
        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            disabled={isSubmitting}
            aria-describedby="submit-help"
          >
            {isSubmitting ? 'Sending...' : 'Send Inquiry'}
          </button>
          <div id="submit-help" className="help-text">
            We typically respond within 24 hours
          </div>
        </div>
      </form>
    </section>
  );
};
