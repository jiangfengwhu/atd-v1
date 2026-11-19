import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const XLogoIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const HomeIcon: React.FC<IconProps> = ({ size = 22, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V21.5h7v-6h4v6h7V9.679l1.318.824 1.06-1.696L12 1.696zM19 19.5h-3v-6H8v6H5V8.428l7-4.375 7 4.375V19.5z" />
  </svg>
);

export const MailIcon: React.FC<IconProps> = ({ size = 22, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M1.998 5.5v13c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-13c0-1.1-.9-2-2-2h-16c-1.1 0-2 .9-2 2zm18 0l-8 5-8-5h16zm0 2.249L12 12.75 3.998 7.75V18.5h16V7.749z" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.47 0 2.82-.49 3.91-1.31l5.3 5.3 1.41-1.41-5.3-5.3c.82-1.09 1.31-2.44 1.31-3.91 0-3.59-2.91-6.5-6.5-6.5zm-4.5 6.5c0-2.48 2.02-4.5 4.5-4.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5-4.5-2.02-4.5-4.5z" />
  </svg>
);

export const VerifiedBadgeIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 22 22"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fill="#1d9bf0"
      d="M20.396 11a2.99 2.99 0 0 0-.89-2.122 3.012 3.012 0 0 0 .19-2.302 3.003 3.003 0 0 0-1.637-1.637 3.01 3.01 0 0 0-2.302.19A2.99 2.99 0 0 0 13.635 4.24a3.007 3.007 0 0 0-2.27 0 2.99 2.99 0 0 0-2.122.89 3.012 3.012 0 0 0-2.302-.19 3.003 3.003 0 0 0-1.637 1.637 3.01 3.01 0 0 0 .19 2.302A2.99 2.99 0 0 0 4.604 11c0 .8.312 1.554.89 2.122a3.012 3.012 0 0 0-.19 2.302 3.003 3.003 0 0 0 1.637 1.637 3.01 3.01 0 0 0 2.302-.19 2.99 2.99 0 0 0 2.122.89c.799 0 1.553-.312 2.122-.89a3.012 3.012 0 0 0 2.302.19 3.003 3.003 0 0 0 1.637-1.637 3.01 3.01 0 0 0-.19-2.302c.578-.568.89-1.322.89-2.122z"
    />
    <path
      fill="#ffffff"
      d="M9.684 14.808L6.476 11.6l1.414-1.414 1.794 1.794 4.546-4.546 1.414 1.414-5.96 5.96z"
    />
  </svg>
);

export const ReplyIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.24c-4.426 0-8.01-3.59-8.01-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.32 2.688 6.01 6.005 6.01h2.245v2.33l4.757-2.63c1.996-1.11 3.238-3.2 3.238-5.48 0-3.39-2.748-6.13-6.129-6.13H9.756z" />
  </svg>
);

export const RepostIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
  </svg>
);

export const HeartIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-2.415.11-4.3 2.1-4.3 4.6 0 2.39 1.442 4.64 3.737 6.82 2.146 2.04 4.582 3.42 5.259 3.78.677-.36 3.113-1.74 5.259-3.78 2.295-2.18 3.737-4.43 3.737-6.82 0-2.5-1.885-4.49-4.3-4.6zm-4.697 16l-.556-.3C10.669 20.76 2 15.65 2 10.1 2 6.55 4.65 3.6 8.1 3.5c1.78-.05 3.51.68 4.7 2.07 1.19-1.39 2.92-2.12 4.7-2.07 3.45.1 6.1 3.05 6.1 6.6 0 5.55-8.669 10.66-9.444 11.1l-.556.3z" />
  </svg>
);

export const HeartFilledIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="#f91880"
    className={className}
    {...props}
  >
    <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.505.3-.505-.3c-4.379-2.55-7.029-5.19-8.38-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.513 6.67z" />
  </svg>
);

export const ViewsIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z" />
  </svg>
);

export const BookmarkIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v16.732c0 .656-.763 1.026-1.282.632L12 16.5l-6.718 5.364C4.763 22.258 4 21.888 4 21.232V4.5zM6.5 4c-.276 0-.5.224-.5.5v14.49l5.688-4.542a.5.5 0 0 1 .624 0L18 18.99V4.5c0-.276-.224-.5-.5-.5h-11z" />
  </svg>
);

export const ShareIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41L7.71 9.71 6.3 8.29 12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21.08 3 19.97 3 18.59V15h2v3.59c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
  </svg>
);

export const MoreIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
  </svg>
);

export const ImageIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 8.75a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0z" />
  </svg>
);

export const GifIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v13c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-13c0-.276-.224-.5-.5-.5h-13zM8.5 8H10v1.5H8.5V14H10v1.5H7V8h1.5zm3 0h1.5v8H11.5V8zm3.5 0h3v1.5h-1.5v1.75H18V13h-1.5v2.5H15V8z" />
  </svg>
);

export const PollIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M6 5v14h2V5H6zm5 4v10h2V9h-2zm5-6v16h2V3h-2zm5 10v6h2v-6h-2z" />
  </svg>
);

export const EmojiIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 18c2.28 0 4.22-1.66 5-4H7c.78 2.34 2.72 4 5 4zm-9-6C3 7.03 7.03 3 12 3s9 4.03 9 9-4.03 9-9 9-9-4.03-9-9zm9-7C8.14 5 5 8.14 5 12s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7z" />
  </svg>
);

export const ScheduleIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M6 3V1h2v2h8V1h2v2h1c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h1zm13 6H5v10h14V9zm-8 2h2v4h-2v-4z" />
  </svg>
);

export const LocationIcon: React.FC<IconProps> = ({ size = 18, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" />
  </svg>
);
